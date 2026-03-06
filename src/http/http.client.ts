import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export interface HttpRequest<TBody = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  data?: TBody;
  timeoutMs?: number;
}

export interface HttpClient {
  request<TResponse = unknown, TBody = unknown>(request: HttpRequest<TBody>): Promise<TResponse>;
}

export const isAxiosError = (error: unknown): error is AxiosError => axios.isAxiosError(error);

export class AxiosHttpClient implements HttpClient {
  private static readonly defaultRetryAttempts = 2;
  private static readonly retryDelayMs = 150;

  constructor(private readonly client: AxiosInstance = axios.create()) {}

  async request<TResponse = unknown, TBody = unknown>(request: HttpRequest<TBody>): Promise<TResponse> {
    const config: AxiosRequestConfig<TBody> = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      params: request.params,
      data: request.data,
      timeout: request.timeoutMs,
    };

    let attempt = 0;

    while (true) {
      try {
        const response: AxiosResponse<TResponse> = await this.client.request<TResponse, AxiosResponse<TResponse>, TBody>(config);
        return response.data;
      } catch (error) {
        if (!this.shouldRetry(error, attempt)) {
          throw error;
        }

        // Carrier APIs can fail transiently under network jitter or upstream instability,
        // so a short retry here improves resiliency without leaking complexity to adapters.
        attempt += 1;
        await this.delay(AxiosHttpClient.retryDelayMs);
      }
    }
  }

  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= AxiosHttpClient.defaultRetryAttempts) {
      return false;
    }

    if (!isAxiosError(error)) {
      return false;
    }

    if (error.code === 'ECONNABORTED') {
      return true;
    }

    if (!error.response) {
      return true;
    }

    return error.response.status >= 500;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
