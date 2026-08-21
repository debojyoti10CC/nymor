# Nymor

An MCP server that lets any MCP-connected AI agent discover paid API
resources, pay for them autonomously in USDC settled on Stellar via the
x402 protocol, and stay inside a persisted spend-policy budget.

- `packages/resources` (`@nymor/resources`) — seller side: two real paid
  endpoints (`GET /xlm-price`, `POST /summarize`) gated by x402.
- `packages/server` (`@nymor/server`) — the product: an MCP server exposing
  `nymor.discover`, `nymor.pay_and_call`, `nymor.spend_status`,
  `nymor.register_resource`, backed by a file-persisted registry and ledger.
- `demo/run-demo.ts` — scripted end-to-end proof run.

## Setup

```bash
pnpm install
pnpm setup:accounts        # generates seller + buyer Stellar keypairs
cp .env.example .env       # fill in from the setup:accounts output
```

Then, by hand (cannot be automated):

1. Fund both accounts with testnet XLM: https://lab.stellar.org/account/fund
2. Establish a USDC trustline on both (testnet USDC issuer:
   `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`).
3. Get testnet USDC into the buyer account: https://faucet.circle.com
4. Get a real `ANTHROPIC_API_KEY` and add it to `.env`.

## Running

```bash
pnpm dev:resources   # starts the seller on NYMOR_RESOURCES_PORT (3001)
pnpm dev:server      # starts the MCP server over stdio
```

Add `nymor-server` to your MCP client config pointing at
`packages/server/dist/index.js` (after `pnpm build`) or `src/index.ts` via
`tsx` for development.

## Testing

```bash
pnpm test                              # unit tests, no network
RUN_INTEGRATION=1 pnpm test            # also runs the real testnet payment test
```

## Demo

See `demo/README.md`.

## Going to mainnet

See Phase 6 in the original build spec: flip `NYMOR_NETWORK` to
`stellar:pubnet`, rotate to a freshly generated buyer key, add rate limiting
to `nymor-resources`, and lower `NYMOR_SESSION_CAP_USD` for first users.
