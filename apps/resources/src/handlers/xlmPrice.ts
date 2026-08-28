import type { Request, Response } from "express";
import { logger } from "../logger.js";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd";
const TIMEOUT_MS = 5000;

export async function xlmPriceHandler(_req: Request, res: Response) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(COINGECKO_URL, { signal: controller.signal });
    if (!upstream.ok) {
      throw new Error(`CoinGecko returned ${upstream.status}`);
    }
    const body = (await upstream.json()) as { stellar?: { usd?: number } };
    const usd = body.stellar?.usd;
    if (typeof usd !== "number") {
      throw new Error("CoinGecko response missing stellar.usd");
    }

    res.json({
      asset: "XLM",
      currency: "USD",
      price: usd,
      source: "coingecko",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "xlm-price: upstream unavailable");
    res.status(503).json({ error: "upstream_unavailable" });
  } finally {
    clearTimeout(timeout);
  }
}
