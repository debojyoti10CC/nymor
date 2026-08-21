/**
 * Scripted end-to-end proof run for Nymor. Requires nymor-resources running
 * (pnpm dev:resources) and a fully configured .env (funded buyer account,
 * USDC trustline, ANTHROPIC_API_KEY). This script talks to the real
 * ledger/registry/payment modules directly — no mocked responses anywhere.
 */
import "dotenv/config";
import { findResource } from "../packages/server/src/registry.js";
import {
  reserveSpend,
  confirmReservation,
  releaseReservation,
  getSpendStatus,
} from "../packages/server/src/ledger.js";
import { payAndFetch } from "../packages/server/src/payment.js";
import { NymorException } from "../packages/server/src/errors.js";

function section(title: string) {
  console.log(`\n=== ${title} ===\n`);
}

async function payFor(resourceId: string, params?: Record<string, unknown>) {
  const resource = await findResource(resourceId);
  if (!resource) throw new Error(`Resource ${resourceId} not in registry`);

  const reservation = await reserveSpend(resourceId, resource.price_usd);
  if (!reservation.allowed) {
    console.log(
      `BLOCKED: ${resourceId} ($${resource.price_usd}) would exceed remaining budget of $${reservation.remainingUsd.toFixed(2)} — refusing to pay.`,
    );
    return null;
  }

  try {
    const { data, stellarTxHash } = await payAndFetch(
      resourceId,
      resource.url,
      resource.method,
      resource.method === "POST" ? params : undefined,
    );
    await confirmReservation(reservation.reservationId, stellarTxHash);
    console.log(`PAID: ${resourceId} — tx https://stellar.expert/explorer/testnet/tx/${stellarTxHash}`);
    console.log(JSON.stringify(data, null, 2));
    return { data, stellarTxHash };
  } catch (err) {
    const reason = err instanceof NymorException ? err.message : String(err);
    await releaseReservation(reservation.reservationId, reason);
    console.error(`FAILED (reservation released, no charge): ${resourceId} — ${reason}`);
    return null;
  }
}

async function main() {
  section("1. Discover + pay for live XLM price");
  await payFor("xlm-price");

  section("2. Spend a few summarizations toward the cap");
  const sampleText =
    "Nymor is an MCP server that lets AI agents discover and pay for API resources autonomously " +
    "using the x402 protocol settled on Stellar, while enforcing a persisted spend policy.";

  for (let i = 0; i < 4; i++) {
    const result = await payFor("summarize", { text: sampleText });
    if (!result) break;
  }

  section("3. One more call to trip the session cap");
  await payFor("summarize", { text: sampleText });

  section("4. Final spend status (real, persisted)");
  const status = await getSpendStatus();
  console.log(JSON.stringify(status, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
