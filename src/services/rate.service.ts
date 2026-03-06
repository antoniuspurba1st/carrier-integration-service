import { Carrier } from '../carriers/carrier.interface';
import { CarrierError } from '../domain/carrier-error';
import { RateRequest } from '../domain/rate-request';
import { RateQuote } from '../domain/rate-quote';

export class RateService {
  private readonly carriers: Map<string, Carrier>;

  constructor(carriers: Carrier[]) {
    this.carriers = new Map(carriers.map((carrier) => [carrier.name.toLowerCase(), carrier]));
  }

  async getRates(carrierName: string, request: RateRequest): Promise<RateQuote[]> {
    const carrier = this.carriers.get(carrierName.toLowerCase());

    if (!carrier) {
      throw new CarrierError({
        carrier: carrierName,
        code: 'UNSUPPORTED_CARRIER',
        message: `Carrier "${carrierName}" is not registered.`,
      });
    }

    return carrier.getRates(request);
  }
}
