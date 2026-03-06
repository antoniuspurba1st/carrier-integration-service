import { z } from 'zod';

export const rateQuoteSchema = z.object({
  carrier: z.string().trim().min(1),
  serviceLevel: z.string().trim().min(1),
  serviceName: z.string().trim().min(1),
  totalCharge: z.object({
    amount: z.number().nonnegative(),
    currencyCode: z.string().trim().length(3),
  }),
  estimatedDeliveryDays: z.number().int().nonnegative().nullable(),
  negotiatedRate: z
    .object({
      amount: z.number().nonnegative(),
      currencyCode: z.string().trim().length(3),
    })
    .nullable(),
  rawServiceCode: z.string().trim().min(1),
});

export type RateQuote = z.infer<typeof rateQuoteSchema>;
