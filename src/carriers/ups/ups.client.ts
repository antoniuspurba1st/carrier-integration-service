import { Carrier } from '../carrier.interface';
import { CarrierError } from '../../domain/carrier-error';
import { RateRequest, rateRequestSchema } from '../../domain/rate-request';
import { RateQuote } from '../../domain/rate-quote';
import { HttpClient, isAxiosError } from '../../http/http.client';
import { UpsAuth } from './ups.auth';
import { mapRateRequestToUpsPayload, mapUpsRateResponseToQuotes } from './ups.mapper';

export class UpsClient implements Carrier {
  readonly name = 'ups';

  constructor(
    private readonly httpClient: HttpClient,
    private readonly auth: UpsAuth,
    private readonly config: {
      baseUrl: string;
      timeoutMs?: number;
    },
  ) {}

  async getRates(request: RateRequest): Promise<RateQuote[]> {
    const validatedRequest = this.validateRequest(request);
    const payload = mapRateRequestToUpsPayload(validatedRequest);
    return this.fetchRates(payload, false);
  }

  private async fetchRates(payload: ReturnType<typeof mapRateRequestToUpsPayload>, retrying: boolean): Promise<RateQuote[]> {
    const token = await this.auth.getAccessToken(retrying);

    try {
      const response = await this.httpClient.request<unknown, typeof payload>({
        method: 'POST',
        url: `${this.config.baseUrl}/api/rating/v1/Shop`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        data: payload,
        timeoutMs: this.config.timeoutMs,
      });

      return mapUpsRateResponseToQuotes(response);
    } catch (error) {
      if (this.shouldRefreshAuth(error, retrying)) {
        this.auth.clearToken();
        return this.fetchRates(payload, true);
      }

      throw this.mapTransportError(error);
    }
  }

  private validateRequest(request: RateRequest): RateRequest {
    const parsed = rateRequestSchema.safeParse(request);

    if (!parsed.success) {
      throw new CarrierError({
        carrier: 'ups',
        code: 'VALIDATION_ERROR',
        message: 'Rate request validation failed.',
        details: parsed.error.flatten(),
      });
    }

    return parsed.data;
  }

  private shouldRefreshAuth(error: unknown, retrying: boolean): boolean {
    if (retrying) {
      return false;
    }

    return isAxiosError(error) && error.response?.status === 401;
  }

  private mapTransportError(error: unknown): CarrierError {
    if (error instanceof CarrierError) {
      return error;
    }

    if (isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        return new CarrierError({
          carrier: 'ups',
          code: 'TIMEOUT_ERROR',
          message: 'UPS request timed out.',
          cause: error,
          retriable: true,
        });
      }

      if (!error.response) {
        return new CarrierError({
          carrier: 'ups',
          code: 'NETWORK_ERROR',
          message: 'Network error while calling UPS.',
          cause: error,
          retriable: true,
        });
      }

      if (error.response.status === 429) {
        return new CarrierError({
          carrier: 'ups',
          code: 'RATE_LIMIT_ERROR',
          message: 'UPS rate limit exceeded.',
          cause: error,
          retriable: true,
          statusCode: 429,
          details: error.response.data,
        });
      }

      if (error.response.status >= 500) {
        return new CarrierError({
          carrier: 'ups',
          code: 'UPSTREAM_SERVER_ERROR',
          message: 'UPS returned a server error.',
          cause: error,
          retriable: true,
          statusCode: error.response.status,
          details: error.response.data,
        });
      }

      if (error.response.status >= 400) {
        return new CarrierError({
          carrier: 'ups',
          code: error.response.status === 401 ? 'AUTHENTICATION_ERROR' : 'UPSTREAM_CLIENT_ERROR',
          message: 'UPS returned a client error.',
          cause: error,
          statusCode: error.response.status,
          details: error.response.data,
        });
      }
    }

    return new CarrierError({
      carrier: 'ups',
      code: 'NETWORK_ERROR',
      message: 'Unexpected UPS integration failure.',
      cause: error,
      retriable: true,
    });
  }
}
