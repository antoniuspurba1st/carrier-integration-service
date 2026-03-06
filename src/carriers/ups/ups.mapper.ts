import { z } from 'zod';

import { CarrierError } from '../../domain/carrier-error';
import { RateRequest } from '../../domain/rate-request';
import { RateQuote } from '../../domain/rate-quote';

const serviceNameMap: Record<string, string> = {
  '01': 'UPS Next Day Air',
  '02': 'UPS 2nd Day Air',
  '03': 'UPS Ground',
  '12': 'UPS 3 Day Select',
};

const upsRateResponseSchema = z.object({
  RateResponse: z.object({
    RatedShipment: z
      .array(
        z.object({
          Service: z.object({
            Code: z.string().min(1),
          }),
          TotalCharges: z.object({
            CurrencyCode: z.string().length(3),
            MonetaryValue: z.string().min(1),
          }),
          NegotiatedRateCharges: z
            .object({
              TotalCharge: z.object({
                CurrencyCode: z.string().length(3),
                MonetaryValue: z.string().min(1),
              }),
            })
            .optional(),
          GuaranteedDelivery: z
            .object({
              BusinessDaysInTransit: z.string().min(1).optional(),
            })
            .optional(),
        }),
      )
      .min(1),
  }),
});

export type UpsRateRequestPayload = ReturnType<typeof mapRateRequestToUpsPayload>;

export const mapRateRequestToUpsPayload = (request: RateRequest) => ({
  RateRequest: {
    Request: {
      RequestOption: 'Rate',
    },
    PickupType: {
      Code: '01',
    },
    Shipment: {
      Shipper: {
        Name: request.origin.name ?? 'Origin Contact',
        ShipperNumber: '',
        Address: {
          AddressLine: [request.origin.addressLine1, request.origin.addressLine2].filter(Boolean),
          City: request.origin.city,
          StateProvinceCode: request.origin.stateProvinceCode,
          PostalCode: request.origin.postalCode,
          CountryCode: request.origin.countryCode,
        },
      },
      ShipTo: {
        Name: request.destination.name ?? 'Destination Contact',
        Address: {
          AddressLine: [request.destination.addressLine1, request.destination.addressLine2].filter(Boolean),
          City: request.destination.city,
          StateProvinceCode: request.destination.stateProvinceCode,
          PostalCode: request.destination.postalCode,
          CountryCode: request.destination.countryCode,
          ResidentialAddressIndicator: request.destination.residential ? 'Y' : undefined,
        },
      },
      ShipFrom: {
        Name: request.origin.name ?? 'Origin Contact',
        Address: {
          AddressLine: [request.origin.addressLine1, request.origin.addressLine2].filter(Boolean),
          City: request.origin.city,
          StateProvinceCode: request.origin.stateProvinceCode,
          PostalCode: request.origin.postalCode,
          CountryCode: request.origin.countryCode,
        },
      },
      Service: request.serviceLevel ? { Code: request.serviceLevel } : undefined,
      Package: request.packages.map((pkg) => ({
        PackagingType: {
          Code: pkg.packagingType === 'UPS_LETTER' ? '01' : pkg.packagingType === 'TUBE' ? '03' : '02',
        },
        Dimensions: {
          UnitOfMeasurement: {
            Code: pkg.dimensions.unit,
          },
          Length: pkg.dimensions.length.toString(),
          Width: pkg.dimensions.width.toString(),
          Height: pkg.dimensions.height.toString(),
        },
        PackageWeight: {
          UnitOfMeasurement: {
            Code: pkg.weight.unit,
          },
          Weight: pkg.weight.value.toString(),
        },
        PackageServiceOptions: pkg.declaredValue
          ? {
              DeclaredValue: {
                CurrencyCode: pkg.declaredValue.currencyCode,
                MonetaryValue: pkg.declaredValue.amount.toFixed(2),
              },
            }
          : undefined,
      })),
    },
  },
});

export const mapUpsRateResponseToQuotes = (payload: unknown): RateQuote[] => {
  const parsed = upsRateResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new CarrierError({
      carrier: 'ups',
      code: 'MALFORMED_RESPONSE',
      message: 'UPS returned a malformed rating response.',
      details: parsed.error.flatten(),
    });
  }

  return parsed.data.RateResponse.RatedShipment.map((shipment) => ({
    carrier: 'ups',
    serviceLevel: shipment.Service.Code,
    serviceName: serviceNameMap[shipment.Service.Code] ?? `UPS Service ${shipment.Service.Code}`,
    totalCharge: {
      amount: Number(shipment.TotalCharges.MonetaryValue),
      currencyCode: shipment.TotalCharges.CurrencyCode,
    },
    estimatedDeliveryDays: shipment.GuaranteedDelivery?.BusinessDaysInTransit
      ? Number(shipment.GuaranteedDelivery.BusinessDaysInTransit)
      : null,
    negotiatedRate: shipment.NegotiatedRateCharges
      ? {
          amount: Number(shipment.NegotiatedRateCharges.TotalCharge.MonetaryValue),
          currencyCode: shipment.NegotiatedRateCharges.TotalCharge.CurrencyCode,
        }
      : null,
    rawServiceCode: shipment.Service.Code,
  }));
};
