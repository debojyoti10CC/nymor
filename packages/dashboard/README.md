# nymor-dashboard

A public web app for humans, alongside the MCP server for agents. Three panels, all against real data:

1. **Marketplace** — reads `GET /registry` on `nymor-resources` (a read-only mirror of the same `nymor.registry.json` the MCP server uses).
2. **Live activity** — polls Horizon's `GET /accounts/{payTo}/effects` for `account_credited` USDC effects and renders them as they land. Uses effects, not `/payments`, because x402's Stellar exact scheme pays by invoking `transfer` on the USDC SAC (a Soroban `invoke_host_function` operation) rather than a classic Payment operation — verified against a real settled testnet tx before building this.
3. **Try it yourself** — connects to Freighter and runs the real x402 flow (`GET`/`POST` → `402` → sign → pay → retry) client-side, using `@x402/fetch` + `@x402/core` + `@x402/stellar` exactly as `nymor-server` does, but with a Freighter-backed `ClientStellarSigner` (`src/freighterSigner.ts`) instead of the buyer's raw Ed25519 key. Freighter's `signAuthEntry`/`signTransaction` already match the SEP-43 shape `@x402/stellar` expects, so no shimming beyond binding the connected address was needed.

## Setup

```bash
cp .env.example .env.local   # fill in VITE_SELLER_PAYTO_ADDRESS from the root .env
pnpm --filter @nymor/dashboard dev
```

Requires `nymor-resources` running (`pnpm dev:resources`) for panels 1 and 3, and a [Freighter](https://www.freighter.app/) wallet with testnet USDC for panel 3.

## Verified

- `GET /registry` returns real registry data (curl-tested against a live `nymor-resources` instance).
- Horizon effects polling verified against a real settled transaction's `account_credited` effect before the panel was built (not assumed from docs).
- The production bundle (`vite build`) compiles cleanly with `@x402/fetch`/`@x402/core`/`@x402/stellar` bundled for the browser.
- The "Try it yourself" panel's payment code path has not been click-tested end-to-end in a real browser with the Freighter extension installed (no browser automation available in the build environment) — verify this manually before relying on it for a demo.
