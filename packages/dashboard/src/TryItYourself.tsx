import { useEffect, useState } from "react";
import { isConnected, requestAccess } from "@stellar/freighter-api";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { config } from "./config.js";
import { createFreighterSigner } from "./freighterSigner.js";
import { fetchRegistry } from "./api.js";
import type { NymorResource } from "./types.js";

type CallState =
  | { status: "idle" }
  | { status: "paying" }
  | { status: "ok"; data: unknown; stellarTxHash: string }
  | { status: "error"; message: string };

export function TryItYourself() {
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [resources, setResources] = useState<NymorResource[]>([]);
  const [calls, setCalls] = useState<Record<string, CallState>>({});

  useEffect(() => {
    isConnected()
      .then((r) => setFreighterInstalled(!r.error && r.isConnected))
      .catch(() => setFreighterInstalled(false));
    fetchRegistry()
      .then(setResources)
      .catch(() => setResources([]));
  }, []);

  async function connect() {
    const res = await requestAccess();
    if (res.error) {
      alert(`Freighter connection failed: ${res.error}`);
      return;
    }
    setAddress(res.address);
  }

  async function payFor(resource: NymorResource) {
    if (!address) return;
    setCalls((prev) => ({ ...prev, [resource.id]: { status: "paying" } }));

    try {
      const signer = createFreighterSigner(address);
      const coreClient = new x402Client().register(
        config.network,
        new ExactStellarScheme(signer, { url: config.stellarRpcUrl }),
      );
      const httpClient = new x402HTTPClient(coreClient);
      const fetchWithPayment = wrapFetchWithPayment(fetch, httpClient);

      const body = resource.method === "POST" ? { text: "Nymor is a paid-resource MCP server for AI agents." } : undefined;
      const response = await fetchWithPayment(resource.url, {
        method: resource.method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`Resource returned ${response.status}`);
      }

      const settlement = httpClient.getPaymentSettleResponse((name) => response.headers.get(name));
      const stellarTxHash = settlement?.transaction;
      if (!stellarTxHash) {
        throw new Error("No settlement transaction hash returned by the facilitator");
      }

      const data = await response.json();
      setCalls((prev) => ({ ...prev, [resource.id]: { status: "ok", data, stellarTxHash } }));
    } catch (err) {
      setCalls((prev) => ({
        ...prev,
        [resource.id]: { status: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  return (
    <section className="panel">
      <h2>Try it yourself</h2>
      <p className="panel-sub">
        Pay for a resource with your own Freighter wallet — no AI agent or MCP client required.
      </p>

      {freighterInstalled === false && (
        <p className="error">
          Freighter wallet not detected.{" "}
          <a href="https://www.freighter.app/" target="_blank" rel="noreferrer">
            Install it
          </a>{" "}
          to use this panel.
        </p>
      )}

      {freighterInstalled && !address && (
        <button className="btn" onClick={() => void connect()}>
          Connect Freighter
        </button>
      )}

      {address && (
        <>
          <p className="muted">Connected as {address.slice(0, 6)}…{address.slice(-6)}</p>
          <ul className="resource-list">
            {resources.map((r) => {
              const call = calls[r.id] ?? { status: "idle" as const };
              return (
                <li key={r.id} className="resource-card">
                  <div className="resource-card-head">
                    <span className="resource-name">{r.name}</span>
                    <span className="resource-price">${r.price_usd.toFixed(2)}</span>
                  </div>
                  <button
                    className="btn"
                    disabled={call.status === "paying"}
                    onClick={() => void payFor(r)}
                  >
                    {call.status === "paying" ? "Paying…" : `Pay $${r.price_usd.toFixed(2)}`}
                  </button>
                  {call.status === "ok" && (
                    <div className="call-result">
                      <pre>{JSON.stringify(call.data, null, 2)}</pre>
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${call.stellarTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        view settled tx
                      </a>
                    </div>
                  )}
                  {call.status === "error" && <p className="error">{call.message}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
