//! Proves the on-chain enforcement claim: a transfer under the spending cap
//! is authorized, and one over it is rejected by the contract itself (a
//! panic inside `__check_auth`, not an application-level check). This drives
//! the real `NymorAccount::__check_auth` entry point — the exact function
//! the Soroban host calls during a live transaction — against the real
//! `nymor-spending-limit-policy` contract, not a mock or a reimplementation.
extern crate std;

use soroban_sdk::{
    auth::{Context, ContractContext, CustomAccountInterface},
    map, symbol_short,
    testutils::Address as _,
    vec, Address, Bytes, Env, IntoVal,
};
use stellar_accounts::smart_account::{AuthPayload, Signer};

use crate::contract::NymorAccount;
use nymor_spending_limit_policy::NymorSpendingLimitPolicy;

fn deploy_account(e: &Env, buyer: &Address, usdc_sac: &Address, cap: i128) -> Address {
    let policy_address = e.register(NymorSpendingLimitPolicy, ());

    e.register(
        NymorAccount,
        (usdc_sac.clone(), buyer.clone(), policy_address, cap, 17_280u32),
    )
}

fn transfer_context(e: &Env, usdc_sac: &Address, from: &Address, to: &Address, amount: i128) -> Context {
    Context::Contract(ContractContext {
        contract: usdc_sac.clone(),
        fn_name: symbol_short!("transfer"),
        args: vec![e, from.into_val(e), to.into_val(e), amount.into_val(e)],
    })
}

fn auth_payload(e: &Env, buyer: &Address, context_rule_id: u32) -> AuthPayload {
    // `Delegated` signatures are verified via `require_auth_for_args`, which
    // `e.mock_all_auths()` satisfies for any address — the raw signature
    // bytes are never inspected for this signer type, so an empty `Bytes` is
    // enough to drive the same code path a real signed request would take.
    AuthPayload {
        signers: map![e, (Signer::Delegated(buyer.clone()), Bytes::new(e))],
        context_rule_ids: vec![e, context_rule_id],
    }
}

#[test]
fn transfer_within_cap_is_authorized() {
    let e = Env::default();
    e.mock_all_auths();

    let buyer = Address::generate(&e);
    let usdc_sac = Address::generate(&e);
    let to = Address::generate(&e);
    let cap = 1_000_000i128; // 0.1 USDC at 7 decimals

    let account = deploy_account(&e, &buyer, &usdc_sac, cap);
    let context = transfer_context(&e, &usdc_sac, &account, &to, 100_000); // 0.01 USDC — under cap

    let signature_payload = e.crypto().sha256(&Bytes::new(&e));
    let signatures = auth_payload(&e, &buyer, 0);

    e.as_contract(&account, || {
        let result = NymorAccount::__check_auth(
            e.clone(),
            signature_payload.clone(),
            signatures,
            vec![&e, context],
        );
        assert!(result.is_ok());
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #3221)")]
fn transfer_over_cap_is_rejected_by_the_contract() {
    let e = Env::default();
    e.mock_all_auths();

    let buyer = Address::generate(&e);
    let usdc_sac = Address::generate(&e);
    let to = Address::generate(&e);
    let cap = 1_000_000i128; // 0.1 USDC at 7 decimals

    let account = deploy_account(&e, &buyer, &usdc_sac, cap);
    let context = transfer_context(&e, &usdc_sac, &account, &to, 5_000_000); // 0.5 USDC — over cap

    let signature_payload = e.crypto().sha256(&Bytes::new(&e));
    let signatures = auth_payload(&e, &buyer, 0);

    e.as_contract(&account, || {
        // Error #3221 = SpendingLimitError::SpendingLimitExceeded, raised
        // from inside nymor-spending-limit-policy's `enforce()` — the network
        // refuses to authorize this transfer; no application code ever gets
        // a chance to decide.
        let _ = NymorAccount::__check_auth(
            e.clone(),
            signature_payload.clone(),
            signatures,
            vec![&e, context],
        );
    });
}
