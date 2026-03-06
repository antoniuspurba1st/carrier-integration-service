# Carrier Integration Service

This project is a TypeScript service module for shopping shipping rates through a carrier adapter. It takes a normalized `RateRequest`, handles UPS authentication behind the scenes, calls the rating API, and returns normalized `RateQuote[]` results. Callers never deal with raw UPS request or response shapes.

## Architecture

The module is built around the adapter pattern. `RateService` works with the shared `Carrier` interface, and each carrier implementation owns its own auth flow, request mapping, response parsing, and error handling. The current UPS adapter is the reference implementation.

Validation happens at the boundaries. Incoming rate requests are validated with Zod before any external call is made, environment configuration is validated on load, and UPS responses are validated before they are mapped into domain models. That keeps transport quirks contained inside the adapter and keeps the rest of the codebase working with stable application-level types.

The HTTP layer is abstracted behind `HttpClient`, which keeps axios out of the service logic and makes tests straightforward to stub. Carrier adapters call the transport layer through the same interface, so cross-cutting behavior stays centralized.

### HTTP Client Capabilities

The Axios-backed HTTP client includes a lightweight retry policy for transient failures, including network errors, timeouts, and upstream `5xx` responses. It also propagates an `X-Correlation-ID` header on every outbound request so calls can be traced across services and external carrier APIs. When upstream requests fail, the client preserves structured error metadata such as status code, response body, correlation ID, and request URL to make external API issues easier to diagnose.

UPS OAuth is handled transparently by `UpsAuth`. It acquires bearer tokens with the client credentials flow, caches them, reuses them until they are near expiry, and refreshes them when needed, including a forced refresh after a 401 from the rating endpoint.

## Project Structure

```text
src
├─ carriers
│  ├─ carrier.interface.ts
│  └─ ups
│     ├─ ups.auth.ts
│     ├─ ups.client.ts
│     └─ ups.mapper.ts
├─ config
│  └─ env.ts
├─ domain
│  ├─ address.ts
│  ├─ carrier-error.ts
│  ├─ package.ts
│  ├─ rate-quote.ts
│  └─ rate-request.ts
├─ http
│  └─ http.client.ts
├─ services
│  └─ rate.service.ts
└─ index.ts
tests
└─ rate.integration.test.ts
```

## Setup

Install dependencies:

```bash
npm install
```

Create a local `.env` from `.env.example` and set:

```bash
UPS_CLIENT_ID=
UPS_CLIENT_SECRET=
UPS_API_BASE_URL=
```

To build the project:

```bash
npm run build
```

## Running Tests

Run the integration test suite with:

```bash
npm test
```

The tests cover request payload construction, UPS response parsing, token reuse and refresh behavior, auth retry handling, and common failure cases like 4xx, 5xx, malformed responses, timeouts, and network issues.

## Example Usage

```ts
import { AxiosHttpClient, RateService, UpsAuth, UpsClient } from './src';

const httpClient = new AxiosHttpClient();
const auth = new UpsAuth(httpClient, {
  clientId: process.env.UPS_CLIENT_ID!,
  clientSecret: process.env.UPS_CLIENT_SECRET!,
  baseUrl: process.env.UPS_API_BASE_URL!,
});

const ups = new UpsClient(httpClient, auth, {
  baseUrl: process.env.UPS_API_BASE_URL!,
});

const rateService = new RateService([ups]);

const quotes = await rateService.getRates('ups', {
  origin: {
    addressLine1: '123 Origin St',
    city: 'Atlanta',
    stateProvinceCode: 'GA',
    postalCode: '30301',
    countryCode: 'US',
  },
  destination: {
    addressLine1: '500 Market St',
    city: 'San Francisco',
    stateProvinceCode: 'CA',
    postalCode: '94105',
    countryCode: 'US',
  },
  packages: [
    {
      weight: { value: 10, unit: 'LB' },
      dimensions: { length: 12, width: 10, height: 8, unit: 'IN' },
      packagingType: 'CUSTOMER_SUPPLIED_PACKAGE',
    },
  ],
});
```

## Adding A New Carrier

To add another carrier, implement the `Carrier` interface, add request and response mappers for that carrier, and register the adapter when you construct `RateService`.

For example, adding FedEx would mean creating a `FedExClient`, mapping between the shared `RateRequest` and FedEx-specific payloads, then passing both adapters into the service:

```ts
new RateService([ups, fedex]);
```

The rest of the application can keep using the same normalized request and response models.

## Future Improvements

- Add request correlation and better integration-level observability.
- Add retry policies with backoff for retryable upstream failures.
- Support carrier-specific option extensions without weakening the shared domain model.
- Add contract tests based on recorded sandbox fixtures.
- Publish compiled artifacts from `dist/` for package distribution.
