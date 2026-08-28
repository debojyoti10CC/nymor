# @nymor/server

The product: an [MCP](https://modelcontextprotocol.io) server that lets any MCP-connected
agent discover paid API resources, pay for them in real USDC settled on Stellar via
[x402](https://developers.stellar.org/docs/build/agentic-payments/x402), and stay inside a
spend cap. Speaks the MCP stdio transport.

## Tools

| Tool | Purpose |
|---|---|
| `discover` | Search the resource registry served by `@nymor/resources` |
| `pay_and_call` | Reserve budget, pay a resource over x402, confirm or release the reservation |
| `spend_status` | Report spend against the session cap |
| `register_resource` | Add a resource to the registry |

## Layout

| Path | Purpose |
|---|---|
| `src/index.ts` | Entry point — wires the four tools onto an `McpServer` over stdio |
| `src/tools/` | One file per MCP tool |
| `src/config.ts` · `logger.ts` · `errors.ts` | Cross-cutting infrastructure |
| `src/registry.ts` · `ledger.ts` · `payment.ts` | Domain logic — catalog, race-safe spend ledger, x402 settlement |
| `data/` | Runtime + seed data (`nymor.registry.json`, `nymor.ledger.json`, `nymor.log`). Paths are overridable via `NYMOR_*_PATH`; only the registry seed is committed. |
| `scripts/` | Standalone one-off scripts — not part of the shipped server. See `scripts/README.md`. |
| `test/` | Unit tests, plus real-network integration tests gated behind `RUN_INTEGRATION=1` |

## Running

```bash
pnpm dev     # tsx watch src/index.ts
pnpm build   # tsc -> dist/
pnpm start   # node dist/index.js   (this is what .mcp.json launches)
```

Requires `.env` filled in at the repo root — see the root `README.md`.

## Testing

```bash
pnpm test                    # unit only
RUN_INTEGRATION=1 pnpm test  # also moves real testnet USDC
```
