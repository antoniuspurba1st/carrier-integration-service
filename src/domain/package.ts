import { z } from 'zod';

const weightUnitSchema = z.enum(['LB', 'KG']);
const dimensionUnitSchema = z.enum(['IN', 'CM']);

export const parcelSchema = z.object({
  packagingType: z.enum(['CUSTOMER_SUPPLIED_PACKAGE', 'UPS_LETTER', 'TUBE']).default('CUSTOMER_SUPPLIED_PACKAGE'),
  weight: z.object({
    value: z.number().positive(),
    unit: weightUnitSchema,
  }),
  dimensions: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    unit: dimensionUnitSchema,
  }),
  declaredValue: z
    .object({
      amount: z.number().nonnegative(),
      currencyCode: z.string().trim().length(3),
    })
    .optional(),
});

export type Parcel = z.infer<typeof parcelSchema>;
