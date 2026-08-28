//! # Nymor Spending Limit Policy
//!
//! A thin contract wrapper around `stellar_accounts::policies::spending_limit`
//! (OpenZeppelin's audited reference implementation — see
//! `audits/` in github.com/OpenZeppelin/stellar-contracts). Deployed once and
//! attached to any `nymor-account` instance's `CallContract(usdc_sac)`
//! context rule. `enforce` is invoked by the account's `__check_auth` on
//! every authorization for that context and panics on a limit breach, so a
//! transfer over budget never reaches settlement — the network rejects it,
//! not application code choosing to check first.
use soroban_sdk::{auth::Context, contract, contractimpl, Address, Env, Vec};
use stellar_accounts::{
    policies::{spending_limit, Policy},
    smart_account::{ContextRule, Signer},
};

#[contract]
pub struct NymorSpendingLimitPolicy;

#[contractimpl]
impl Policy for NymorSpendingLimitPolicy {
    type AccountParams = spending_limit::SpendingLimitAccountParams;

    fn enforce(
        e: &Env,
        context: Context,
        authenticated_signers: Vec<Signer>,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        spending_limit::enforce(e, &context, &authenticated_signers, &context_rule, &smart_account)
    }

    fn install(
        e: &Env,
        install_params: Self::AccountParams,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        spending_limit::install(e, &install_params, &context_rule, &smart_account)
    }

    fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address) {
        spending_limit::uninstall(e, &context_rule, &smart_account)
    }
}

#[contractimpl]
impl NymorSpendingLimitPolicy {
    pub fn get_spending_limit_data(
        e: Env,
        context_rule_id: u32,
        smart_account: Address,
    ) -> spending_limit::SpendingLimitData {
        spending_limit::get_spending_limit_data(&e, context_rule_id, &smart_account)
    }

    pub fn set_spending_limit(
        e: Env,
        spending_limit: i128,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        spending_limit::set_spending_limit(&e, spending_limit, &context_rule, &smart_account)
    }
}
