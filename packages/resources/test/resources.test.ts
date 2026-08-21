import { describe, expect, it, vi, beforeEach } from "vitest";

process.env.NYMOR_NETWORK = "stellar:testnet";
process.env.NYMOR_STELLAR_RPC_URL = "https://soroban-testnet.stellar.org";
process.env.NYMOR_FACILITATOR_URL = "https://example.invalid/facilitator";
process.env.NYMOR_SELLER_PAYTO_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
process.env.OPENROUTER_API_KEY = "sk-or-v1-test-key";

const { xlmPriceHandler } = await import("../src/resources/xlmPrice.js");
const { summarizeHandler } = await import("../src/resources/summarize.js");
const { stellarBalanceHandler } = await import("../src/resources/stellarBalance.js");
const { generateImageHandler } = await import("../src/resources/generateImage.js");
const { weatherHandler } = await import("../src/resources/weather.js");

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
  res.send = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  res.setHeader = vi.fn();
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

describe("stellarBalanceHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a malformed address with 400 before calling Horizon", async () => {
    const res = mockRes();
    await stellarBalanceHandler({ query: { address: "not-an-address" } } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns real-shaped balance data when Horizon succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          balances: [{ asset_type: "native", balance: "100.0000000" }],
        }),
      })),
    );

    const res = mockRes();
    const address = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    await stellarBalanceHandler({ query: { address } } as any, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body.address).toBe(address);
    expect(res.body.balances[0]).toEqual({ asset: "XLM", issuer: undefined, balance: "100.0000000" });
    vi.unstubAllGlobals();
  });

  it("returns 404 when the account doesn't exist, never a fake balance", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));

    const res = mockRes();
    await stellarBalanceHandler(
      { query: { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    vi.unstubAllGlobals();
  });
});

describe("generateImageHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a missing prompt with 400 before calling Pollinations", async () => {
    const res = mockRes();
    await generateImageHandler({ body: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("streams back real image bytes with the upstream content type", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => "image/jpeg" },
        arrayBuffer: async () => fakeBytes,
      })),
    );

    const res = mockRes();
    await generateImageHandler({ body: { prompt: "a fox" } } as any, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
    expect(Buffer.isBuffer(res.body)).toBe(true);
    vi.unstubAllGlobals();
  });

  it("returns 503 upstream_unavailable when Pollinations fails, never a fake image", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));

    const res = mockRes();
    await generateImageHandler({ body: { prompt: "a fox" } } as any, res);

    expect(res.status).toHaveBeenCalledWith(503);
    vi.unstubAllGlobals();
  });
});

describe("weatherHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an out-of-range latitude with 400 before calling Open-Meteo", async () => {
    const res = mockRes();
    await weatherHandler({ query: { lat: "999", lon: "0" } } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns real-shaped weather data when Open-Meteo succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 21, weathercode: 3, wind_speed_10m: 12.6, time: "2026-01-01T00:00" },
        }),
      })),
    );

    const res = mockRes();
    await weatherHandler({ query: { lat: "51.5", lon: "-0.12" } } as any, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body.temperature_c).toBe(21);
    expect(res.body.conditions).toBe("Overcast");
    vi.unstubAllGlobals();
  });

  it("returns 503 upstream_unavailable when Open-Meteo fails, never fake weather", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));

    const res = mockRes();
    await weatherHandler({ query: { lat: "51.5", lon: "-0.12" } } as any, res);

    expect(res.status).toHaveBeenCalledWith(503);
    vi.unstubAllGlobals();
  });
});
