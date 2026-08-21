import { describe, expect, it } from "vitest";

// Real testnet integration test — proves Nymor is not a mockup. Only runs
// when explicitly requested (real money and real network calls involved),
// gated behind RUN_INTEGRATION=1. Requires a fully-configured .env: funded
// buyer account, USDC trustline, and nymor-resources running on
// NYMOR_RESOURCES_PORT (default 3001).
const runIntegration = process.env.RUN_INTEGRATION === "1";

describe.runIf(runIntegration)("payment integration (real Stellar testnet)", () => {
  it("pays for xlm-price on testnet and records a real tx hash in the ledger", async () => {
    const { reserveSpend, confirmReservation, getSpendStatus } = await import("../src/ledger.js");
    const { payAndFetch } = await import("../src/payment.js");
    const { findResource } = await import("../src/registry.js");

    const resource = await findResource("xlm-price");
    expect(resource).toBeDefined();
    if (!resource) return;

    const before = await getSpendStatus();

    const reservation = await reserveSpend(resource.id, resource.price_usd);
    expect(reservation.allowed).toBe(true);
    if (!reservation.allowed) return;

    const { data, stellarTxHash } = await payAndFetch(resource.id, resource.url, resource.method);

    expect(stellarTxHash).toMatch(/^[a-f0-9]{64}$/i);
    expect(data).toHaveProperty("price");
    expect(typeof (data as { price: unknown }).price).toBe("number");

    await confirmReservation(reservation.reservationId, stellarTxHash);

    const after = await getSpendStatus();
    expect(after.spent_usd).toBeCloseTo(before.spent_usd + resource.price_usd);

    console.log(`Settled tx: https://stellar.expert/explorer/testnet/tx/${stellarTxHash}`);
  }, 30_000);
});
