export type NymorError =
  | { code: "RESOURCE_NOT_FOUND"; resource_id: string }
  | { code: "BUDGET_EXCEEDED"; price_usd: number; remaining_usd: number }
  | { code: "PAYMENT_FAILED"; reason: string }
  | { code: "UPSTREAM_UNAVAILABLE"; resource_id: string }
  | { code: "INVALID_INPUT"; details: string };

export class NymorException extends Error {
  readonly nymorError: NymorError;

  constructor(nymorError: NymorError) {
    super(NymorException.describe(nymorError));
    this.name = "NymorException";
    this.nymorError = nymorError;
  }

  private static describe(err: NymorError): string {
    switch (err.code) {
      case "RESOURCE_NOT_FOUND":
        return `Resource not found: ${err.resource_id}`;
      case "BUDGET_EXCEEDED":
        return `Payment of $${err.price_usd.toFixed(2)} would exceed remaining budget of $${err.remaining_usd.toFixed(2)}`;
      case "PAYMENT_FAILED":
        return `Payment failed: ${err.reason}`;
      case "UPSTREAM_UNAVAILABLE":
        return `Upstream unavailable for resource: ${err.resource_id}`;
      case "INVALID_INPUT":
        return `Invalid input: ${err.details}`;
    }
  }
}
