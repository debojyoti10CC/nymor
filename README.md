# Nymor

An MCP server that lets any MCP-connected AI agent discover paid API
resources, pay for them autonomously in USDC settled on Stellar via the
x402 protocol, and stay inside a spend budget — enforced both by a
persisted application-level ledger and, for the buyer's smart account, by a
Soroban contract the Stellar network itself refuses to let overspend.

## Packages

- `packages/resources` (`@nymor/resources`) — seller side: five real paid
  resources (live price data, LLM summarization, a Stellar balance lookup,
  image generation, and weather) gated by x402, plus a read-only
  `GET /registry` for the dashboard. See `packages/resources/README.md`.
- `packages/server` (`@nymor/server`) — the product: an MCP server exposing
  `nymor.discover`, `nymor.pay_and_call`, `nymor.spend_status`,
  `nymor.register_resource`, backed by a file-persisted registry and ledger.
- `packages/policy` (`nymor-account`, `nymor-spending-limit-policy`) — Soroban
  smart-account contracts, deployed live on testnet, that enforce a spend cap
  at the network level. See `packages/policy/README.md` for the deployed
  contract addresses and two real, independently verifiable proof
  transactions.
- `packages/dashboard` (`@nymor/dashboard`) — a public web app: browse the
  registry, watch real payments land in a live feed, read the live on-chain
  spend cap, and pay for a resource yourself with Freighter — no AI agent
  required. See `packages/dashboard/README.md`.

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
4. Get a free `OPENROUTER_API_KEY` at https://openrouter.ai/keys (no card
   required for `:free` models) and add it to `.env`.

## Running

```bash
pnpm dev:resources   # starts the seller on NYMOR_RESOURCES_PORT (3001)
pnpm dev:server      # starts the MCP server over stdio
pnpm dev:dashboard   # starts the public dashboard on :5173 (see packages/dashboard/README.md)
```

`.mcp.json` in the repo root already wires `nymor-server` up for Claude Code
(project-scoped, points at `packages/server/dist/index.js` — run `pnpm build`
first). No secrets go in that file; `config.ts` loads `.env` by an absolute
path anchored to the repo root regardless of what working directory the MCP
client launches the process from, so it works the same way in Claude Code,
Claude Desktop, or any other MCP client. Restart your MCP client session
after adding/changing `.mcp.json` to pick it up, then sanity-check with "what
paid resources does nymor know about?" — it should call `nymor.discover` and
list the available resources.

For other MCP clients, point them at the same command:
`node packages/server/dist/index.js`.

## Testing

```bash
pnpm test                              # unit tests, no network
RUN_INTEGRATION=1 pnpm test            # also runs the real testnet payment
                                        # test and a real MCP stdio protocol
                                        # test (spawns the built server and
                                        # drives it exactly as a real MCP
                                        # client would, not a direct import)
```

`packages/policy` has its own Rust test suite proving the on-chain spend cap
is enforced correctly; see `packages/policy/README.md`.

## Going to mainnet

Flip `NYMOR_NETWORK` to `stellar:pubnet`, rotate to a freshly generated buyer
key, add rate limiting to `nymor-resources`, add `nymor-dashboard`'s real
deployed origin to `NYMOR_CORS_ALLOWED_ORIGINS`, deploy `nymor-policy` on
mainnet, and lower `NYMOR_SESSION_CAP_USD` for first users.
