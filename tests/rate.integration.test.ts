import { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from '@jest/globals';

import { UpsAuth } from '../src/carriers/ups/ups.auth';
import { UpsClient } from '../src/carriers/ups/ups.client';
import { CarrierError } from '../src/domain/carrier-error';
import { HttpClient, HttpRequest } from '../src/http/http.client';
import { RateService } from '../src/services/rate.service';

class StubHttpClient implements HttpClient {
  public readonly requests: HttpRequest<unknown>[] = [];

  constructor(private readonly handler: (request: HttpRequest<unknown>) => Promise<unknown>) {}

  async request<TResponse = unknown, TBody = unknown>(request: HttpRequest<TBody>): Promise<TResponse> {
    this.requests.push(request as HttpRequest<unknown>);
    return (await this.handler(request as HttpRequest<unknown>)) as TResponse;
  }
}

const createAxiosError = (params: {
  status?: number;
  code?: string;
  data?: unknown;
  message: string;
}) =>
  new AxiosError(
    params.message,
    params.code,
    { headers: {}, method: 'POST', url: 'https://example-ups.test' } as InternalAxiosRequestConfig,
    {},
    params.status
      ? {
          status: params.status,
          statusText: params.message,
          headers: {},
          config: { headers: {} } as InternalAxiosRequestConfig,
          data: params.data,
        }
      : undefined,
  );

const baseRequest = {
  origin: {
    name: 'Warehouse A',
    addressLine1: '123 Origin St',
    city: 'Atlanta',
    stateProvinceCode: 'GA',
    postalCode: '30301',
    countryCode: 'US',
  },
  destination: {
    name: 'Jane Doe',
    addressLine1: '500 Market St',
    city: 'San Francisco',
    stateProvinceCode: 'CA',
    postalCode: '94105',
    countryCode: 'US',
    residential: true,
  },
  packages: [
    {
      weight: {
        value: 10,
        unit: 'LB' as const,
      },
      dimensions: {
        length: 12,
        width: 10,
        height: 8,
        unit: 'IN' as const,
      },
      declaredValue: {
        amount: 100,
        currencyCode: 'USD',
      },
      packagingType: 'CUSTOMER_SUPPLIED_PACKAGE' as const,
    },
  ],
};

const buildUpsService = (httpClient: HttpClient, now?: () => number) => {
  const auth = new UpsAuth(httpClient, {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    baseUrl: 'https://example-ups.test',
    now,
  });

  const ups = new UpsClient(httpClient, auth, {
    baseUrl: 'https://example-ups.test',
  });

  return new RateService([ups]);
};

describe('RateService UPS integration', () => {
  it('builds the UPS payload and normalizes the rate response', async () => {
    const httpClient = new StubHttpClient(async (request) => {
      if (request.url.endsWith('/oauth/token')) {
        return {
          access_token: 'token-1',
          expires_in: 3600,
          token_type: 'Bearer',
        };
      }

      return {
        RateResponse: {
          RatedShipment: [
            {
              Service: { Code: '03' },
              TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '18.55' },
              NegotiatedRateCharges: {
                TotalCharge: { CurrencyCode: 'USD', MonetaryValue: '16.25' },
              },
              GuaranteedDelivery: { BusinessDaysInTransit: '5' },
            },
          ],
        },
      };
    });

    const service = buildUpsService(httpClient);
    const quotes = await service.getRates('ups', baseRequest);

    expect(quotes).toEqual([
      {
        carrier: 'ups',
        serviceLevel: '03',
        serviceName: 'UPS Ground',
        totalCharge: { amount: 18.55, currencyCode: 'USD' },
        negotiatedRate: { amount: 16.25, currencyCode: 'USD' },
        estimatedDeliveryDays: 5,
        rawServiceCode: '03',
      },
    ]);

    expect(httpClient.requests).toHaveLength(2);
    const rateRequest = httpClient.requests[1];
    expect(rateRequest.headers).toMatchObject({
      Authorization: 'Bearer token-1',
      'Content-Type': 'application/json',
    });
    expect(rateRequest.data).toMatchObject({
      RateRequest: {
        Shipment: {
          ShipTo: {
            Address: {
              ResidentialAddressIndicator: 'Y',
              City: 'San Francisco',
            },
          },
          Package: [
            {
              PackagingType: { Code: '02' },
              PackageWeight: {
                UnitOfMeasurement: { Code: 'LB' },
                Weight: '10',
              },
              Dimensions: {
                UnitOfMeasurement: { Code: 'IN' },
                Length: '12',
                Width: '10',
                Height: '8',
              },
              PackageServiceOptions: {
                DeclaredValue: { CurrencyCode: 'USD', MonetaryValue: '100.00' },
              },
            },
          ],
        },
      },
    });
  });

  it('reuses cached tokens until expiration and refreshes automatically', async () => {
    let nowMs = 1_000_000;
    let tokenCounter = 0;

    const httpClient = new StubHttpClient(async (request) => {
      if (request.url.endsWith('/oauth/token')) {
        tokenCounter += 1;
        return {
          access_token: `token-${tokenCounter}`,
          expires_in: 60,
          token_type: 'Bearer',
        };
      }

      return {
        RateResponse: {
          RatedShipment: [
            {
              Service: { Code: '03' },
              TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '20.00' },
            },
          ],
        },
      };
    });

    const service = buildUpsService(httpClient, () => nowMs);

    await service.getRates('ups', baseRequest);
    await service.getRates('ups', baseRequest);
    nowMs += 61_000;
    await service.getRates('ups', baseRequest);

    expect(tokenCounter).toBe(2);
    expect(httpClient.requests.filter((request) => request.url.endsWith('/oauth/token'))).toHaveLength(2);
  });

  it('refreshes the token and retries once when UPS responds with 401', async () => {
    let rateAttempt = 0;
    let tokenCounter = 0;

    const httpClient = new StubHttpClient(async (request) => {
      if (request.url.endsWith('/oauth/token')) {
        tokenCounter += 1;
        return {
          access_token: `token-${tokenCounter}`,
          expires_in: 3600,
        };
      }

      rateAttempt += 1;
      if (rateAttempt === 1) {
        throw createAxiosError({
          message: 'Unauthorized',
          status: 401,
          code: 'ERR_BAD_REQUEST',
          data: { message: 'Expired token' },
        });
      }

      return {
        RateResponse: {
          RatedShipment: [
            {
              Service: { Code: '12' },
              TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '25.10' },
            },
          ],
        },
      };
    });

    const service = buildUpsService(httpClient);
    const quotes = await service.getRates('ups', baseRequest);

    expect(quotes[0].serviceLevel).toBe('12');
    expect(tokenCounter).toBe(2);
    expect(rateAttempt).toBe(2);
  });

  it('maps 4xx and 5xx upstream failures into structured CarrierError values', async () => {
    const clientErrorHttp = new StubHttpClient(async (request) => {
      if (request.url.endsWith('/oauth/token')) {
        return { access_token: 'token-1', expires_in: 3600 };
      }

      throw createAxiosError({
        message: 'Bad request',
        status: 422,
        code: 'ERR_BAD_REQUEST',
        data: { errors: ['invalid package weight'] },
      });
    });

    const serverErrorHttp = new StubHttpClient(async (request) => {
      if (request.url.endsWith('/oauth/token')) {
        return { access_token: 'token-1', expires_in: 3600 };
      }

      throw createAxiosError({
        message: 'Service unavailable',
        status: 503,
        code: 'ERR_BAD_RESPONSE',
        data: { message: 'maintenance' },
      });
    });

    await expect(buildUpsService(clientErrorHttp).getRates('ups', baseRequest)).rejects.toMatchObject({
      code: 'UPSTREAM_CLIENT_ERROR',
      statusCode: 422,
      carrier: 'ups',
    });

    await expect(buildUpsService(serverErrorHttp).getRates('ups', baseRequest)).rejects.toMatchObject({
      code: 'UPSTREAM_SERVER_ERROR',
      statusCode: 503,
      carrier: 'ups',
      retriable: true,
    });
  });

  it('rejects malformed UPS responses with a structured error', async () => {
    const httpClient = new StubHttpClient(async (request) => {
      if (request.url.endsWith('/oauth/token')) {
        return { access_token: 'token-1', expires_in: 3600 };
      }

      return {
        RateResponse: {
          RatedShipment: [
            {
              Service: { BadCode: '03' },
            },
          ],
        },
      };
    });

    const service = buildUpsService(httpClient);
    const promise = service.getRates('ups', baseRequest);

    await expect(promise).rejects.toBeInstanceOf(CarrierError);
    await expect(promise).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
      carrier: 'ups',
    });
  });

  it('surfaces unsupported carriers before any transport call', async () => {
    const service = buildUpsService(new StubHttpClient(async () => ({ access_token: 'ignored', expires_in: 1 })));

    await expect(service.getRates('fedex', baseRequest)).rejects.toMatchObject({
      code: 'UNSUPPORTED_CARRIER',
      carrier: 'fedex',
    });
  });

  it('maps timeouts and network failures into structured errors', async () => {
    const timeoutHttp = new StubHttpClient(async (request) => {
      if (request.url.endsWith('/oauth/token')) {
        return { access_token: 'token-1', expires_in: 3600 };
      }

      throw createAxiosError({
        message: 'timeout',
        code: 'ECONNABORTED',
      });
    });

    const networkHttp = new StubHttpClient(async (request) => {
      if (request.url.endsWith('/oauth/token')) {
        return { access_token: 'token-1', expires_in: 3600 };
      }

      const error = createAxiosError({
        message: 'socket hang up',
      });
      Object.assign(error, { request: {} });
      throw error;
    });

    await expect(buildUpsService(timeoutHttp).getRates('ups', baseRequest)).rejects.toMatchObject({
      code: 'TIMEOUT_ERROR',
      carrier: 'ups',
    });

    await expect(buildUpsService(networkHttp).getRates('ups', baseRequest)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      carrier: 'ups',
    });
  });
});
