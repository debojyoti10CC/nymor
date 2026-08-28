# apps/server/scripts

Standalone, run-by-hand scripts. **None of these are part of the shipped server** — they
are not imported by `src/`, not covered by tests, and not run in CI. They live here
because they depend on `@nymor/server`'s installed packages (`@stellar/stellar-sdk`,
`@x402/*`).

Each script reads its inputs from environment variables / `argv` and is safe to delete
without affecting the product.

| Script | What it does |
|---|---|
| `onchain-proof.mjs` | Submits a real signed transaction through `nymor-account`'s custom `__check_auth` on testnet — the on-chain enforcement proof cited in `contracts/policy/README.md`. Builds the OZ smart-account auth payload by hand at the XDR level. |
| `bulk-buyer-activity.mjs` | Funds several fresh testnet accounts and has each pay `@nymor/resources` over the real x402 flow, producing diverse-origin transaction history. Args: `[numAccounts] [paymentsPerAccount]`. |
| `classic-payment-burst.mjs` | Sends genuine classic `Payment` operations (tiny real XLM) to a destination, to exercise stats that only count classic payments. Args: `<destG...> [numTx] [opsPerTx]`. |

Run from the repo root, e.g.:

```bash
NYMOR_BUYER_STELLAR_PRIVATE_KEY=S... node apps/server/scripts/onchain-proof.mjs
```
