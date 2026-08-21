import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import lockfile from "proper-lockfile";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";

const ledgerEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  resource_id: z.string(),
  price_usd: z.number(),
  status: z.enum(["pending", "paid", "blocked", "failed"]),
  stellar_tx_hash: z.string().optional(),
  reason: z.string().optional(),
  allowed: z.boolean(),
});

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

const ledgerFileSchema = z.object({
  session_cap_usd: z.number(),
  spent_usd: z.number(),
  entries: z.array(ledgerEntrySchema),
});

export type LedgerFile = z.infer<typeof ledgerFileSchema>;

async function ensureLedgerFile(path: string): Promise<void> {
  if (!existsSync(path)) {
    const initial: LedgerFile = {
      session_cap_usd: config.sessionCapUsd,
      spent_usd: 0,
      entries: [],
    };
    await writeFile(path, JSON.stringify(initial, null, 2), "utf-8");
    logger.info({ path }, "ledger: created new ledger file");
  }
}

async function readLedger(): Promise<LedgerFile> {
  await ensureLedgerFile(config.ledgerPath);
  const raw = await readFile(config.ledgerPath, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`ledger.json is not valid JSON: ${(err as Error).message}`);
  }

  const result = ledgerFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`ledger.json failed schema validation: ${result.error.message}`);
  }

  return result.data;
}

async function writeLedger(ledger: LedgerFile): Promise<void> {
  const validated = ledgerFileSchema.parse(ledger);
  await writeFile(config.ledgerPath, JSON.stringify(validated, null, 2), "utf-8");
}

// USD amounts are 2-decimal; round after arithmetic to avoid float drift
// like 0.01 + 0.02 - 0.02 = 0.009999999999999998 leaking into spend_status.
function roundCents(usd: number): number {
  return Math.round(usd * 100) / 100;
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  await ensureLedgerFile(config.ledgerPath);
  const release = await lockfile.lock(config.ledgerPath, {
    retries: { retries: 50, minTimeout: 20, maxTimeout: 200, factor: 1.2 },
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}

export async function getSpendStatus(): Promise<{
  session_cap_usd: number;
  spent_usd: number;
  remaining_usd: number;
  entry_count: number;
}> {
  const ledger = await readLedger();
  return {
    session_cap_usd: ledger.session_cap_usd,
    spent_usd: ledger.spent_usd,
    remaining_usd: Math.max(0, roundCents(ledger.session_cap_usd - ledger.spent_usd)),
    entry_count: ledger.entries.length,
  };
}

/**
 * Checks budget and, if it fits, immediately reserves it by adding a
 * "pending" entry and incrementing spent_usd — all under one file lock, so
 * the reservation itself (not just the eventual "paid" write) is atomic
 * with respect to concurrent tool calls. The actual Stellar payment happens
 * *after* this returns; confirmReservation/releaseReservation settle it.
 */
export async function reserveSpend(
  resourceId: string,
  priceUsd: number,
): Promise<{ allowed: true; reservationId: string } | { allowed: false; remainingUsd: number }> {
  return withLock(async () => {
    const ledger = await readLedger();
    const remaining = roundCents(ledger.session_cap_usd - ledger.spent_usd);

    if (priceUsd > remaining) {
      const entry: LedgerEntry = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        resource_id: resourceId,
        price_usd: priceUsd,
        status: "blocked",
        reason: "would exceed session cap",
        allowed: false,
      };
      ledger.entries.push(entry);
      await writeLedger(ledger);
      logger.warn({ resourceId, priceUsd, remaining }, "ledger: blocked spend over cap");
      return { allowed: false, remainingUsd: Math.max(0, remaining) };
    }

    const reservationId = randomUUID();
    const entry: LedgerEntry = {
      id: reservationId,
      timestamp: new Date().toISOString(),
      resource_id: resourceId,
      price_usd: priceUsd,
      status: "pending",
      allowed: true,
    };
    ledger.entries.push(entry);
    ledger.spent_usd = roundCents(ledger.spent_usd + priceUsd);
    await writeLedger(ledger);
    logger.info({ resourceId, priceUsd, reservationId }, "ledger: reserved spend");
    return { allowed: true, reservationId };
  });
}

/** Settles a reservation into a confirmed payment with its real Stellar tx hash. */
export async function confirmReservation(reservationId: string, stellarTxHash: string): Promise<void> {
  await withLock(async () => {
    const ledger = await readLedger();
    const entry = ledger.entries.find((e) => e.id === reservationId);
    if (!entry) throw new Error(`No reservation found with id ${reservationId}`);
    entry.status = "paid";
    entry.stellar_tx_hash = stellarTxHash;
    entry.timestamp = new Date().toISOString();
    await writeLedger(ledger);
    logger.info({ reservationId, stellarTxHash }, "ledger: confirmed payment");
  });
}

/** Rolls back a reservation that failed to settle on-chain, refunding the reserved amount. */
export async function releaseReservation(reservationId: string, reason: string): Promise<void> {
  await withLock(async () => {
    const ledger = await readLedger();
    const entry = ledger.entries.find((e) => e.id === reservationId);
    if (!entry) throw new Error(`No reservation found with id ${reservationId}`);
    entry.status = "failed";
    entry.reason = reason;
    entry.allowed = false;
    entry.timestamp = new Date().toISOString();
    ledger.spent_usd = Math.max(0, roundCents(ledger.spent_usd - entry.price_usd));
    await writeLedger(ledger);
    logger.error({ reservationId, reason }, "ledger: released failed reservation");
  });
}
