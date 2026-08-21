function required(name: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}. Copy .env.example to .env.local.`);
  }
  return value;
}

function requiredCaip2Network(name: string): `${string}:${string}` {
  const value = required(name);
  if (!/^[^:]+:[^:]+$/.test(value)) {
    throw new Error(`${name} must be a CAIP-2 network id like "stellar:testnet", got: ${value}`);
  }
  return value as `${string}:${string}`;
}

export const config = {
  resourcesUrl: required("VITE_NYMOR_RESOURCES_URL"),
  horizonUrl: required("VITE_HORIZON_URL"),
  stellarRpcUrl: required("VITE_STELLAR_RPC_URL"),
  networkPassphrase: required("VITE_STELLAR_NETWORK_PASSPHRASE"),
  network: requiredCaip2Network("VITE_STELLAR_NETWORK"),
  sellerPayToAddress: required("VITE_SELLER_PAYTO_ADDRESS"),
  // nymor-policy: deployed once via `stellar contract deploy`, not
  // per-buyer — see packages/policy/README.md for the deploy record.
  policyContractId: required("VITE_SPENDING_LIMIT_POLICY_CONTRACT_ID"),
  accountContractId: required("VITE_NYMOR_ACCOUNT_CONTRACT_ID"),
  accountContextRuleId: Number(import.meta.env.VITE_NYMOR_ACCOUNT_CONTEXT_RULE_ID ?? "0"),
  // Real testnet transactions from packages/server/scripts/onchain-proof.mjs
  // — see packages/policy/README.md's "Enforcement proof" section.
  proofTxUnderCap: required("VITE_PROOF_TX_UNDER_CAP"),
  proofTxOverCap: required("VITE_PROOF_TX_OVER_CAP"),
};
