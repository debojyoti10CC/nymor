export interface NymorResource {
  id: string;
  name: string;
  description: string;
  url: string;
  method: "GET" | "POST";
  price_usd: number;
  network: string;
}

// x402's Stellar exact-scheme pays by invoking `transfer` on the USDC SAC
// (a Soroban `invoke_host_function` operation, verified against a real
// settled tx), not a classic Payment operation — so `account_credited`
// effects are what actually carries from/to/amount for these payments, not
// the /payments endpoint the SAC-agnostic docs describe. Trimmed to the
// fields Live Activity reads; see
// https://developers.stellar.org/docs/data/apis/horizon/api-reference/resources/effects/object/account-credited
export interface HorizonCreditEffect {
  id: string;
  paging_token: string;
  type: "account_credited";
  account: string;
  amount: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  created_at: string;
  _links: {
    operation: { href: string };
  };
}
