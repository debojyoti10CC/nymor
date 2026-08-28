import { useEffect, useRef, useState } from "react";
import { fetchRecentUsdcCredits, operationIdFromEffect, stellarExpertOpUrl } from "./api.js";
import type { HorizonCreditEffect } from "./types.js";

const POLL_INTERVAL_MS = 6_000;

export function LiveActivity() {
  const [payments, setPayments] = useState<HorizonCreditEffect[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const credits = await fetchRecentUsdcCredits();
        if (cancelled) return;
        setError(null);
        const fresh = credits.filter((c) => !seenIds.current.has(c.id));
        if (fresh.length > 0) {
          fresh.forEach((c) => seenIds.current.add(c.id));
          setPayments((prev) => [...fresh, ...prev].slice(0, 30));
        } else if (payments.length === 0) {
          // First load: seed the feed even with nothing "new" relative to itself.
          credits.forEach((c) => seenIds.current.add(c.id));
          setPayments(credits);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="panel">
      <h2>Live activity</h2>
      <p className="panel-sub">
        Real USDC payments landing on Stellar testnet, polled from Horizon every {POLL_INTERVAL_MS / 1000}s.
      </p>
      {error && <p className="error">Could not reach Horizon: {error}</p>}
      {payments.length === 0 && !error && <p className="muted">No payments yet — waiting…</p>}
      <ul className="activity-feed">
        {payments.map((p) => (
          <li key={p.id} className="activity-row">
            <span className="activity-amount">${Number(p.amount).toFixed(2)}</span>
            <span className="activity-time">{new Date(p.created_at).toLocaleTimeString()}</span>
            <a
              className="activity-link"
              href={stellarExpertOpUrl(operationIdFromEffect(p))}
              target="_blank"
              rel="noreferrer"
            >
              view tx
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
