export type CarrierErrorCode =
  | 'VALIDATION_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'UPSTREAM_CLIENT_ERROR'
  | 'UPSTREAM_SERVER_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'UNSUPPORTED_CARRIER';

export class CarrierError extends Error {
  public readonly code: CarrierErrorCode;
  public readonly carrier: string;
  public readonly details?: unknown;
  public readonly retriable: boolean;
  public readonly statusCode?: number;
  public readonly cause?: unknown;

  constructor(params: {
    message: string;
    code: CarrierErrorCode;
    carrier: string;
    details?: unknown;
    retriable?: boolean;
    statusCode?: number;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'CarrierError';
    this.code = params.code;
    this.carrier = params.carrier;
    this.details = params.details;
    this.retriable = params.retriable ?? false;
    this.statusCode = params.statusCode;
    this.cause = params.cause;
  }
}
