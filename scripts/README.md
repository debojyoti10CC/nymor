# scripts

Repo-level tooling that isn't tied to a single app.

| Script | What it does |
|---|---|
| `setup-testnet-accounts.ts` | Generates a fresh seller + buyer keypair and prints the next (human) steps for funding them and adding trustlines. Run via `pnpm setup:accounts`. |

App-specific one-off scripts live next to the app that owns them — see `apps/server/scripts/`.
