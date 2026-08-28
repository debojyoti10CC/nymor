import { useEffect, useState } from "react";
import { fetchRegistry } from "./api.js";
import type { NymorResource } from "./types.js";

export function Marketplace() {
  const [resources, setResources] = useState<NymorResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRegistry()
      .then(setResources)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <section className="panel">
      <h2>Marketplace</h2>
      <p className="panel-sub">
        Paid API resources any MCP-connected AI agent can discover and pay for through Nymor.
      </p>
      {error && <p className="error">Could not load the registry: {error}</p>}
      {!resources && !error && <p className="muted">Loading…</p>}
      {resources && (
        <ul className="resource-list">
          {resources.map((r) => (
            <li key={r.id} className="resource-card">
              <div className="resource-card-head">
                <span className="resource-name">{r.name}</span>
                <span className="resource-price">${r.price_usd.toFixed(2)}</span>
              </div>
              <p className="resource-desc">{r.description}</p>
              <code className="resource-endpoint">
                {r.method} {r.url}
              </code>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
