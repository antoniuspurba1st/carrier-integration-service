import { z } from 'zod';

import { addressSchema } from './address';
import { parcelSchema } from './package';

export const rateRequestSchema = z.object({
  origin: addressSchema,
  destination: addressSchema,
  packages: z.array(parcelSchema).min(1),
  serviceLevel: z.string().trim().min(1).optional(),
});

export type RateRequest = z.infer<typeof rateRequestSchema>;
