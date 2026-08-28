import { useEffect, useState } from "react";
import { config } from "./config.js";
import { fetchOnChainSpendingLimit, stroopsToUsd, type SpendingLimitData } from "./onchain.js";

function expertContractUrl(id: string): string {
  return `https://stellar.expert/explorer/testnet/contract/${id}`;
}
function expertTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export function OnChainPolicy() {
  const [data, setData] = useState<SpendingLimitData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOnChainSpendingLimit()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <section className="panel">
      <h2>On-chain policy</h2>
      <p className="panel-sub">
        The spend cap enforced by the Stellar network itself — a transaction over the cap is rejected
        inside the smart account's own <code>__check_auth</code>, before any funds move. Not a claim: two
        real transactions below prove it, one accepted and one rejected on-chain.
      </p>

      <div className="policy-grid">
        <div className="policy-row">
          <span className="policy-label">Smart account (nymor-account)</span>
          <a href={expertContractUrl(config.accountContractId)} target="_blank" rel="noreferrer">
            {config.accountContractId.slice(0, 8)}…{config.accountContractId.slice(-6)}
          </a>
        </div>
        <div className="policy-row">
          <span className="policy-label">Spending-limit policy</span>
          <a href={expertContractUrl(config.policyContractId)} target="_blank" rel="noreferrer">
            {config.policyContractId.slice(0, 8)}…{config.policyContractId.slice(-6)}
          </a>
        </div>

        {error && <p className="error">Could not read live policy state: {error}</p>}
        {!data && !error && <p className="muted">Reading live cap from chain…</p>}
        {data && (
          <>
            <div className="policy-row">
              <span className="policy-label">Cap (live, read from chain)</span>
              <span>
                ${stroopsToUsd(data.spendingLimit)} / {Math.round(data.periodLedgers / 17280)} day
                {data.periodLedgers > 17280 ? "s" : ""}
              </span>
            </div>
            <div className="policy-row">
              <span className="policy-label">Spent in current window</span>
              <span>${stroopsToUsd(data.cachedTotalSpent)}</span>
            </div>
          </>
        )}
      </div>

      <h3 className="policy-proof-heading">Proof transactions</h3>
      <ul className="policy-proof-list">
        <li>
          <span className="proof-badge proof-badge-ok">accepted</span> 0.10 USDC, under cap —{" "}
          <a href={expertTxUrl(config.proofTxUnderCap)} target="_blank" rel="noreferrer">
            view on Stellar Expert
          </a>
        </li>
        <li>
          <span className="proof-badge proof-badge-rejected">rejected on-chain</span> 0.90 USDC, would
          exceed cap —{" "}
          <a href={expertTxUrl(config.proofTxOverCap)} target="_blank" rel="noreferrer">
            view on Stellar Expert
          </a>
        </li>
      </ul>
    </section>
  );
}
