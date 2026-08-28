//! # Nymor Account
//!
//! The buyer's Stellar smart account. On its own it authorizes nothing —
//! every context rule attached to it must carry either a signer or a policy
//! (usually both: the buyer's key as signer, `nymor-spending-limit-policy` as
//! policy). The spending-limit policy is what turns "the app checks a local
//! ledger before calling pay" into "the network itself refuses to settle a
//! transfer past the cap," since `SpendingLimitPolicyContract::enforce`
//! panics inside the same host-function invocation that would move funds.
use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    Address, Env, IntoVal, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::policies::spending_limit::SpendingLimitAccountParams;
use stellar_accounts::smart_account::{
    self, AuthPayload, ContextRule, ContextRuleType, ExecutionEntryPoint, Signer, SmartAccount,
    SmartAccountError,
};

#[contract]
pub struct NymorAccount;

#[contractimpl]
impl NymorAccount {
    /// Deploys the account with a single `CallContract(usdc_sac)` context
    /// rule holding the buyer's signer and a `nymor-spending-limit-policy`
    /// instance, both installed in the same deployment. Deployment itself
    /// needs no smart-account auth (Soroban authorizes the constructor via
    /// the deployer's transaction signature, same as the upstream
    /// `MultisigContract` example) — that's deliberate: it means there's no
    /// post-deploy `add_context_rule` call needed, which *would* require the
    /// smart account's own custom-signature auth to add.
    ///
    /// Typed scalar params (rather than a generic `Map<Address, Val>` for
    /// policies) so every argument has an unambiguous CLI/SDK encoding —
    /// nymor only ever deploys this one policy shape.
    pub fn __constructor(
        e: &Env,
        usdc_sac: Address,
        buyer: Address,
        spending_limit_policy: Address,
        spending_limit: i128,
        period_ledgers: u32,
    ) {
        let mut signers: Vec<Signer> = Vec::new(e);
        signers.push_back(Signer::Delegated(buyer));

        let install_params = SpendingLimitAccountParams { spending_limit, period_ledgers };
        let mut policies: Map<Address, Val> = Map::new(e);
        policies.set(spending_limit_policy, install_params.into_val(e));

        smart_account::add_context_rule(
            e,
            &ContextRuleType::CallContract(usdc_sac),
            &String::from_str(e, "nymor-default"),
            None,
            &signers,
            &policies,
        );
    }
}

#[contractimpl]
impl CustomAccountInterface for NymorAccount {
    type Error = SmartAccountError;
    type Signature = AuthPayload;

    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        smart_account::do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}

#[contractimpl(contracttrait)]
impl SmartAccount for NymorAccount {}

#[contractimpl(contracttrait)]
impl ExecutionEntryPoint for NymorAccount {}
