import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { config } from "./config.js";
import { NymorException } from "./errors.js";

// x402 settlement alone takes ~5s (facilitator verify+submit on Stellar), and
// the resource's own handler runs after that — a slow upstream (e.g. LLM
// inference) adds on top. 10s was too tight for that combined round trip.
const PAYMENT_TIMEOUT_MS = 30_000;

const signer = createEd25519Signer(config.buyerPrivateKey, config.network);
const coreClient = new x402Client().register(
  "stellar:*",
  new ExactStellarScheme(signer, { url: config.stellarRpcUrl }),
);
const httpClient = new x402HTTPClient(coreClient);
const fetchWithPayment = wrapFetchWithPayment(fetch, httpClient);

export interface PayAndFetchResult {
  data: unknown;
  stellarTxHash: string;
}

/**
 * Performs the real x402 buyer flow: request -> 402 -> sign -> pay -> retry.
 * Throws a typed NymorException (PAYMENT_FAILED / UPSTREAM_UNAVAILABLE) on
 * any ambiguity, since "did the payment settle" must never be swallowed.
 */
export async function payAndFetch(
  resourceId: string,
  url: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<PayAndFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAYMENT_TIMEOUT_MS);

  try {
    const response = await fetchWithPayment(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new NymorException({
        code: "UPSTREAM_UNAVAILABLE",
        resource_id: resourceId,
      });
    }

    const settlement = httpClient.getPaymentSettleResponse((name) => response.headers.get(name));
    const stellarTxHash = settlement?.transaction;
    if (!stellarTxHash) {
      throw new NymorException({
        code: "PAYMENT_FAILED",
        reason: "no settlement transaction hash returned by facilitator",
      });
    }

    // Not every resource returns JSON — generate-image returns raw image
    // bytes. Parse by content type rather than assuming JSON, since a
    // mismatch here throws away a payment that already settled (found by
    // actually paying for a binary resource end-to-end, not assumed).
    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : {
          contentType,
          base64: Buffer.from(await response.arrayBuffer()).toString("base64"),
        };
    return { data, stellarTxHash };
  } catch (err) {
    if (err instanceof NymorException) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new NymorException({
        code: "PAYMENT_FAILED",
        reason: `payment timed out after ${PAYMENT_TIMEOUT_MS / 1000}s`,
      });
    }
    throw new NymorException({
      code: "PAYMENT_FAILED",
      reason: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }
}
