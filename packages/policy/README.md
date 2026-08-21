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

`account/src/test.rs` drives `NymorAccount::__check_auth` — the exact entry point the Soroban host calls during a real transaction — against the real deployed-shape contracts (`nymor-account` + `nymor-spending-limit-policy`, registered in a `soroban-sdk` test environment, not mocks):

```
cargo test --package nymor-account
running 2 tests
test test::transfer_over_cap_is_rejected_by_the_contract - should panic ... ok
test test::transfer_within_cap_is_authorized ... ok
```

- A transfer under the cap is authorized (`__check_auth` returns `Ok(())`).
- A transfer over the cap panics with `Error(Contract, #3221)` (`SpendingLimitExceeded`) — raised from inside the policy's `enforce()`, before any funds move.

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
