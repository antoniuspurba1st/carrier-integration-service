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

    const response: AxiosResponse<TResponse> = await this.client.request<TResponse, AxiosResponse<TResponse>, TBody>(config);
    return response.data;
  }
}
