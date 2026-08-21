import { describe, expect, it, vi, beforeEach } from "vitest";

process.env.NYMOR_NETWORK = "stellar:testnet";
process.env.NYMOR_STELLAR_RPC_URL = "https://soroban-testnet.stellar.org";
process.env.NYMOR_FACILITATOR_URL = "https://example.invalid/facilitator";
process.env.NYMOR_SELLER_PAYTO_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
process.env.OPENROUTER_API_KEY = "sk-or-v1-test-key";

const { xlmPriceHandler } = await import("../src/resources/xlmPrice.js");
const { summarizeHandler } = await import("../src/resources/summarize.js");

function mockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

describe("xlmPriceHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns real-shaped price data when upstream succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ stellar: { usd: 0.123 } }),
      })),
    );

    const res = mockRes();
    await xlmPriceHandler({} as any, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body.asset).toBe("XLM");
    expect(res.body.price).toBe(0.123);
    expect(typeof res.body.timestamp).toBe("string");
    vi.unstubAllGlobals();
  });

  it("returns 503 upstream_unavailable when CoinGecko fails, never a fake price", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );

    const res = mockRes();
    await xlmPriceHandler({} as any, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.body).toEqual({ error: "upstream_unavailable" });
    vi.unstubAllGlobals();
  });
});

describe("summarizeHandler", () => {
  it("rejects text over 20,000 chars with 400 before calling OpenRouter", async () => {
    const res = mockRes();
    await summarizeHandler({ body: { text: "a".repeat(20_001) } } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toBe("invalid_input");
  });

  it("rejects missing text with 400", async () => {
    const res = mockRes();
    await summarizeHandler({ body: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
