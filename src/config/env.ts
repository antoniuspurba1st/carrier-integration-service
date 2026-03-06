import dotenv from 'dotenv';
import { z } from 'zod';

import { CarrierError } from '../domain/carrier-error';

dotenv.config();

const envSchema = z.object({
  UPS_CLIENT_ID: z.string().min(1),
  UPS_CLIENT_SECRET: z.string().min(1),
  UPS_API_BASE_URL: z.string().url(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): EnvConfig => {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    throw new CarrierError({
      carrier: 'system',
      code: 'CONFIGURATION_ERROR',
      message: 'Missing or invalid environment configuration.',
      details: parsed.error.flatten(),
    });
  }

  return parsed.data;
};
