import { RateRequest } from '../domain/rate-request';
import { RateQuote } from '../domain/rate-quote';

export interface Carrier {
  readonly name: string;
  getRates(request: RateRequest): Promise<RateQuote[]>;
}
