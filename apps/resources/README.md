# @nymor/resources

The seller side of Nymor: real, paid API resources gated by [x402](https://developers.stellar.org/docs/build/agentic-payments/x402), plus a read-only `GET /registry` endpoint the MCP server and dashboard both read from.

Every resource here calls a real upstream and returns real data — none of them return placeholder or fabricated content, and every failure path returns a typed `503 upstream_unavailable` rather than a fake success.

## Resources

| Route | Method | Price | Upstream | Notes |
|---|---|---|---|---|
| `/xlm-price` | GET | $0.01 | CoinGecko | Live XLM/USD price |
| `/summarize` | POST | $0.02 | OpenRouter (`:free` model) | Body: `{ "text": string }` |
| `/stellar-balance` | GET | $0.01 | Stellar Horizon (testnet) | Query: `?address=G...` |
| `/generate-image` | POST | $0.03 | Pollinations.ai | Body: `{ "prompt": string }`; returns raw image bytes |
| `/weather` | GET | $0.01 | Open-Meteo | Query: `?lat=&lon=` |

`/registry` (free, no payment) serves the same `nymor.registry.json` catalog `nymor-server` and `nymor-dashboard` both read.

## Running

```bash
pnpm dev
```

Requires `.env` filled in at the repo root — see the root `README.md`. None of the upstreams above require their own API key except `/summarize` (`OPENROUTER_API_KEY`, free tier).

## Testing

```bash
pnpm test
```

Unit tests mock the upstream `fetch` call per resource and assert three things for each: invalid input is rejected with `400` before any upstream call happens, a successful upstream response produces real-shaped output, and a failed upstream produces `503` — never a fabricated result standing in for a real one.

## Adding a new resource

1. Add a handler in `src/handlers/` following the existing pattern: validate input with `zod`, call the real upstream with a timeout, return real data or a typed `503`.
2. Register its route in `src/index.ts` and its price in `src/x402.ts`.
3. Add it to the registry (`apps/server/src/registry.ts`'s `DEFAULT_REGISTRY`, and `apps/server/data/nymor.registry.json` if a registry file already exists on disk).
4. Add unit tests in `test/resources.test.ts` following the existing pattern.

If the resource's body/query shape isn't `{ text }`/no-params, `apps/dashboard/src/TryItYourself.tsx`'s `BODY_FIELD_BY_RESOURCE`/`QUERY_PARAMS_BY_RESOURCE` maps need an entry too, or the dashboard's "try it yourself" panel won't know what to send.
