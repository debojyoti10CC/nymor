import type { Request, Response } from "express";
import { z } from "zod";
import { logger } from "../logger.js";

const HORIZON_TESTNET_URL = "https://horizon-testnet.stellar.org";
const TIMEOUT_MS = 5000;

const querySchema = z.object({
  address: z.string().regex(/^G[A-Z2-7]{55}$/, "must be a valid Stellar G... account address"),
});

interface HorizonBalance {
  balance: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
}

// Real Horizon lookup, no key needed — ties Nymor visibly into the Stellar
// ecosystem specifically, not just "crypto in general."
export async function stellarBalanceHandler(req: Request, res: Response) {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_input",
      details: parsed.error.issues.map((i) => i.message).join("; "),
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(`${HORIZON_TESTNET_URL}/accounts/${parsed.data.address}`, {
      signal: controller.signal,
    });
    if (upstream.status === 404) {
      res.status(404).json({ error: "account_not_found" });
      return;
    }
    if (!upstream.ok) {
      throw new Error(`Horizon returned ${upstream.status}`);
    }

    const body = (await upstream.json()) as { balances: HorizonBalance[] };
    res.json({
      address: parsed.data.address,
      network: "stellar:testnet",
      balances: body.balances.map((b) => ({
        asset: b.asset_type === "native" ? "XLM" : (b.asset_code ?? b.asset_type),
        issuer: b.asset_issuer,
        balance: b.balance,
      })),
      source: "horizon-testnet",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "stellar-balance: upstream (Horizon) unavailable");
    res.status(503).json({ error: "upstream_unavailable" });
  } finally {
    clearTimeout(timeout);
  }
}
