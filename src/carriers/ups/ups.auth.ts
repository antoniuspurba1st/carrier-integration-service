import { z } from 'zod';

import { CarrierError } from '../../domain/carrier-error';
import { HttpClient } from '../../http/http.client';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.union([z.number().positive(), z.string().min(1)]),
  token_type: z.string().min(1).default('Bearer'),
});

type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

export class UpsAuth {
  private cache: TokenCache | null = null;
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly httpClient: HttpClient,
    private readonly config: {
      clientId: string;
      clientSecret: string;
      baseUrl: string;
      timeoutMs?: number;
      now?: () => number;
    },
  ) {}

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cache && !this.isExpired(this.cache.expiresAtMs)) {
      return this.cache.accessToken;
    }

    if (!this.inflight) {
      this.inflight = this.fetchToken().finally(() => {
        this.inflight = null;
      });
    }

    return this.inflight;
  }

  clearToken(): void {
    this.cache = null;
  }

  private isExpired(expiresAtMs: number): boolean {
    return expiresAtMs <= this.now() + 30_000;
  }

  private now(): number {
    return this.config.now ? this.config.now() : Date.now();
  }

  private async fetchToken(): Promise<string> {
    try {
      const payload = await this.httpClient.request<unknown, string>({
        method: 'POST',
        url: `${this.config.baseUrl}/security/v1/oauth/token`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
        },
        data: 'grant_type=client_credentials',
        timeoutMs: this.config.timeoutMs,
      });

      const parsed = tokenResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new CarrierError({
          carrier: 'ups',
          code: 'MALFORMED_RESPONSE',
          message: 'UPS returned a malformed OAuth response.',
          details: parsed.error.flatten(),
        });
      }

      const expiresInSeconds = Number(parsed.data.expires_in);
      this.cache = {
        accessToken: parsed.data.access_token,
        expiresAtMs: this.now() + expiresInSeconds * 1000,
      };

      return this.cache.accessToken;
    } catch (error) {
      if (error instanceof CarrierError) {
        throw error;
      }

      throw new CarrierError({
        carrier: 'ups',
        code: 'AUTHENTICATION_ERROR',
        message: 'Failed to authenticate with UPS.',
        cause: error,
        retriable: true,
      });
    }
  }
}
