import { Address, rpc, xdr, scValToNative } from "@stellar/stellar-sdk";
import { config } from "./config.js";

export interface SpendingLimitData {
  spendingLimit: bigint;
  cachedTotalSpent: bigint;
  periodLedgers: number;
}

// Reads stellar_accounts::policies::spending_limit's persistent storage
// entry directly via Soroban RPC's getLedgerEntries — no invocation, no
// signer needed, since it's a plain ledger-entry read. Key shape mirrors
// SpendingLimitStorageKey::AccountContext(Address, u32) exactly (a
// single-tuple-variant enum -> ScVal::Vec([Symbol(variant), ...fields])) —
// verified against the real deployed contract before shipping this, not
// assumed from the Rust source alone.
export async function fetchOnChainSpendingLimit(): Promise<SpendingLimitData> {
  const server = new rpc.Server(config.stellarRpcUrl);
  const key = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("AccountContext"),
    Address.fromString(config.accountContractId).toScVal(),
    xdr.ScVal.scvU32(config.accountContextRuleId),
  ]);

  const result = await server.getContractData(config.policyContractId, key, rpc.Durability.Persistent);
  const native = scValToNative(result.val.contractData().val()) as {
    spending_limit: bigint;
    cached_total_spent: bigint;
    period_ledgers: number;
  };

  return {
    spendingLimit: native.spending_limit,
    cachedTotalSpent: native.cached_total_spent,
    periodLedgers: native.period_ledgers,
  };
}

// USDC SAC uses 7 decimals, same as classic Stellar assets.
export function stroopsToUsd(stroops: bigint): string {
  return (Number(stroops) / 1e7).toFixed(2);
}
