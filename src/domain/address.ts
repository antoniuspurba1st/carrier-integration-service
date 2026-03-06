import { z } from 'zod';

export const addressSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  companyName: z.string().trim().min(1).max(100).optional(),
  addressLine1: z.string().trim().min(1).max(100),
  addressLine2: z.string().trim().max(100).optional(),
  city: z.string().trim().min(1).max(50),
  stateProvinceCode: z.string().trim().min(2).max(5),
  postalCode: z.string().trim().min(3).max(12),
  countryCode: z.string().trim().length(2),
  residential: z.boolean().optional(),
});

export type Address = z.infer<typeof addressSchema>;
