# nymor-policy

The on-chain enforcement layer: turns "the app checks a local ledger before calling pay" into "the Stellar network itself refuses to settle a transfer past the cap." Two Soroban contracts, both wrapping OpenZeppelin's audited [`stellar-accounts`](https://github.com/OpenZeppelin/stellar-contracts) smart-account primitives rather than reimplementing them:

- **`account/`** (`nymor-account`) — the buyer's smart account. Deployed with a single `CallContract(usdc_sac)` context rule holding the buyer's `Delegated` Ed25519 signer and a `nymor-spending-limit-policy` instance, both installed in one constructor call.
- **`spending-limit-policy/`** (`nymor-spending-limit-policy`) — a thin wrapper around `stellar_accounts::policies::spending_limit`, OpenZeppelin's own reference spending-limit policy. `enforce()` panics with `SpendingLimitExceeded` (error #3221) from inside the smart account's `__check_auth`, before any transfer settles.

## Verified on testnet

| Contract | Address | |
|---|---|---|
| `nymor-spending-limit-policy` | `CCW6AVTBRVKEDGDDW7CUDALPDLNLUC2M7XBLI56OU65SI2TPBEKJQGHC` | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CCW6AVTBRVKEDGDDW7CUDALPDLNLUC2M7XBLI56OU65SI2TPBEKJQGHC) |
| `nymor-account` (buyer's smart account) | `CAF2HV5N57UDZOMGD2WC4BI472Z3CRSQYQ2V4AKPPP5W4PD4HC4LBKVW` | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CAF2HV5N57UDZOMGD2WC4BI472Z3CRSQYQ2V4AKPPP5W4PD4HC4LBKVW) |

Deployed with the buyer's real key (`GAH7HODDFAEBV4OUBJTCUZXVEW7S6DJ37JNW3CTP3KZVANWWQ4EEIYRX`, the same one `nymor-server` pays with) as the `Delegated` signer, scoped to the testnet USDC SAC (`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`), with a 1.00 USDC / ~1 day (17,280 ledgers) cap. Confirmed live via `get_context_rule`/`get_spending_limit_data` reads against the deployed contracts (not just the deploy tx succeeding).

## Enforcement proof

Two independent layers of proof, not one:

**1. Real on-chain transactions.** `apps/server/scripts/onchain-proof.mjs` submits a real, signed transaction through `nymor-account`'s custom `__check_auth` on testnet — not a simulation, not a local test, an actual transaction the network accepted or rejected:

| Case | Amount | Result | Tx hash |
|---|---|---|---|
| Under cap | 0.10 USDC | **Accepted** | [`e4358552…`](https://stellar.expert/explorer/testnet/tx/e4358552e77b46c87a5ff408bd42cd63efbf26a276e41806148b364a6bd1c4b2) |
| Over cap | 0.90 USDC (total spend would exceed 1.00/day) | **Rejected on-chain** — `Error(Contract, #3221)` `SpendingLimitExceeded` | [`d0f3e128…`](https://stellar.expert/explorer/testnet/tx/d0f3e128df2bd2d2582a532c32e119dedd1957afdaa79f50412eebca76965f74) |

Both cross-checked independently on Horizon (`successful: true`/`false`) and against `get_spending_limit_data` — the rejected transaction left `cached_total_spent` unchanged, confirming no phantom write on failure.

Getting a real signed transaction through required hand-crafting two things neither `stellar-sdk`'s `authorizeEntry()` nor `@x402/stellar` know how to build: the custom `auth_digest = sha256(signature_payload || context_rule_ids.to_xdr())` wrapped in an `AuthPayload{context_rule_ids, signers}` ScVal, and a *second* separate auth entry for the `Delegated` signer's own classic account (required because `Signer::Delegated` authenticates via `require_auth_for_args`, called *inside* `__check_auth` — the host matches this against a `ContractFn(contract=nymor-account, function="__check_auth", args=[auth_digest])` invocation, which OZ's own docs confirm "requires manual authorization entry crafting, because it is not returned in a simulation mode." The exact shape came from reading `soroban-env-host`'s `auth.rs` and `account_contract.rs` source directly — see the script's comments for the full trail.

**2. `account/src/test.rs`** drives the same `NymorAccount::__check_auth` entry point against the real deployed-shape contracts in a `soroban-sdk` test environment (not mocks), as a fast, repeatable regression check:

```
cargo test --package nymor-account
running 2 tests
test test::transfer_over_cap_is_rejected_by_the_contract - should panic ... ok
test test::transfer_within_cap_is_authorized ... ok
```

## What's *not* wired up, and why

`nymor-server`'s buyer signer still uses a raw Ed25519 keypair (`createEd25519Signer` from `@x402/stellar`), not this smart account. Making the agent's real payments route through `nymor-account` would require the buyer to sign `auth_digest = sha256(signature_payload || context_rule_ids.to_xdr())` — a custom digest OpenZeppelin's smart accounts bind to prevent rule-selection downgrade attacks — and wrap the signature in an `AuthPayload{context_rule_ids, signers}` structure.

`@x402/stellar`'s `ExactStellarScheme` hardcodes a call to `@stellar/stellar-sdk`'s default `authorizeEntry()`, which only supports the classic `{public_key, signature}` credential shape and exposes no hook to override it. Building this out would mean forking `@x402/stellar`'s internals (not just implementing a custom signer, which the library's `ClientStellarSigner` interface does support) — out of scope for this pass. The reference `multisig-smart-account` example in OpenZeppelin's own repo notes the same gap and points to a third-party (explicitly "demonstration purposes only") tool for it.

## Building

Requires a working MSVC or GNU host linker (`soroban-sdk`'s proc-macros need to compile for the host, not just `wasm32v1-none`) and `stellar-cli` v25.2.0+. Build with:

```bash
stellar contract build
```

(not plain `cargo build --target wasm32v1-none` — the crate uses `soroban-sdk`'s spec-shaking feature, which requires `stellar contract build`'s environment variable.)

Test with:

```bash
cargo test --package nymor-account --package nymor-spending-limit-policy
```
