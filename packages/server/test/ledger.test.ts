import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

const TEST_DIR = path.join(os.tmpdir(), `nymor-ledger-test-${randomUUID()}`);

beforeEach(async () => {
  const fs = await import("node:fs/promises");
  await fs.mkdir(TEST_DIR, { recursive: true });
  process.env.NYMOR_LEDGER_PATH = path.join(TEST_DIR, "nymor.ledger.json");
  process.env.NYMOR_REGISTRY_PATH = path.join(TEST_DIR, "nymor.registry.json");
  process.env.NYMOR_SESSION_CAP_USD = "0.10";
  process.env.NYMOR_NETWORK = "stellar:testnet";
  process.env.NYMOR_STELLAR_RPC_URL = "https://soroban-testnet.stellar.org";
  process.env.NYMOR_FACILITATOR_URL = "https://example.invalid/facilitator";
  process.env.NYMOR_BUYER_STELLAR_PRIVATE_KEY = "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

async function freshLedger() {
  // Reset module registry so config.ts re-reads the env vars set in beforeEach.
  vi.resetModules();
  return import("../src/ledger.js");
}

describe("ledger", () => {
  it("allows a spend within the session cap", async () => {
    const ledger = await freshLedger();
    const result = await ledger.reserveSpend("xlm-price", 0.01);
    expect(result.allowed).toBe(true);

    const status = await ledger.getSpendStatus();
    expect(status.spent_usd).toBeCloseTo(0.01);
    expect(status.remaining_usd).toBeCloseTo(0.09);
  });

  it("blocks a spend that would exceed the session cap", async () => {
    const ledger = await freshLedger();
    await ledger.reserveSpend("xlm-price", 0.08);
    const blocked = await ledger.reserveSpend("summarize", 0.05);

    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.remainingUsd).toBeCloseTo(0.02);
    }

    const status = await ledger.getSpendStatus();
    expect(status.entry_count).toBe(2);
    expect(status.spent_usd).toBeCloseTo(0.08);
  });

  it("never overwrites prior entries — every attempt is appended", async () => {
    const ledger = await freshLedger();
    await ledger.reserveSpend("xlm-price", 0.01);
    await ledger.reserveSpend("xlm-price", 0.01);
    const blocked = await ledger.reserveSpend("summarize", 0.20);
    expect(blocked.allowed).toBe(false);

    const status = await ledger.getSpendStatus();
    expect(status.entry_count).toBe(3);
  });

  it("confirms a reservation with a real tx hash", async () => {
    const ledger = await freshLedger();
    const reserved = await ledger.reserveSpend("xlm-price", 0.01);
    expect(reserved.allowed).toBe(true);
    if (!reserved.allowed) return;

    await ledger.confirmReservation(reserved.reservationId, "deadbeef1234");
    const status = await ledger.getSpendStatus();
    expect(status.spent_usd).toBeCloseTo(0.01);
  });

  it("releases a failed reservation and refunds the reserved amount", async () => {
    const ledger = await freshLedger();
    const reserved = await ledger.reserveSpend("xlm-price", 0.01);
    expect(reserved.allowed).toBe(true);
    if (!reserved.allowed) return;

    await ledger.releaseReservation(reserved.reservationId, "network timeout");
    const status = await ledger.getSpendStatus();
    expect(status.spent_usd).toBeCloseTo(0);
  });

  it("prevents concurrent reservations from double-spending past the cap", async () => {
    const ledger = await freshLedger();
    // Cap is $0.10. Fire 20 concurrent $0.01 reservations — only 10 should succeed.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => ledger.reserveSpend("xlm-price", 0.01)),
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(10);

    const status = await ledger.getSpendStatus();
    expect(status.spent_usd).toBeCloseTo(0.1);
    expect(status.entry_count).toBe(20);
  });
});
