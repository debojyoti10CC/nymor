import { useEffect, useState } from "react";
import { Buffer } from "buffer";
import { isConnected, requestAccess } from "@stellar/freighter-api";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { config } from "./config.js";
import { createFreighterSigner } from "./freighterSigner.js";
import { fetchRegistry } from "./api.js";
import type { NymorResource } from "./types.js";

type CallResult =
  | { kind: "json"; data: unknown }
  | { kind: "image"; dataUri: string };

type CallState =
  | { status: "idle" }
  | { status: "paying" }
  | { status: "ok"; result: CallResult; stellarTxHash: string }
  | { status: "error"; message: string };

// Not every POST resource takes the same body shape — the registry doesn't
// (and shouldn't) formally describe request schemas, so this is the one
// place that knows summarize wants `text` and generate-image wants
// `prompt`. Anything not listed here falls back to a generic `text` field
// rather than silently sending nothing.
const BODY_FIELD_BY_RESOURCE: Record<string, string> = {
  summarize: "text",
  "generate-image": "prompt",
};

const DEFAULT_INPUT_BY_RESOURCE: Record<string, string> = {
  summarize: "Nymor is a paid-resource MCP server for AI agents.",
  "generate-image": "a small red fox in a forest, digital art",
};

// GET resources that need query params — same reasoning as
// BODY_FIELD_BY_RESOURCE above, kept in one place rather than trying to
// parse param names out of the registry's free-text description.
const QUERY_PARAMS_BY_RESOURCE: Record<string, string> = {
  "stellar-balance": "address=GBGB3TQD7C2FLZSASQ6QJZ6EWDCL2ZYCY7NPQWYDCB35NPLSSIQ2BEHZ",
  weather: "lat=51.5&lon=-0.12",
};

export function TryItYourself() {
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [resources, setResources] = useState<NymorResource[]>([]);
  const [calls, setCalls] = useState<Record<string, CallState>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    isConnected()
      .then((r) => setFreighterInstalled(!r.error && r.isConnected))
      .catch(() => setFreighterInstalled(false));
    fetchRegistry()
      .then((fetched) => {
        setResources(fetched);
        const defaults: Record<string, string> = {};
        fetched.forEach((r) => {
          if (r.method === "POST") defaults[r.id] = DEFAULT_INPUT_BY_RESOURCE[r.id] ?? "";
          else if (QUERY_PARAMS_BY_RESOURCE[r.id]) defaults[r.id] = QUERY_PARAMS_BY_RESOURCE[r.id];
        });
        setInputs(defaults);
      })
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

      let body: string | undefined;
      let url = resource.url;
      if (resource.method === "POST") {
        const field = BODY_FIELD_BY_RESOURCE[resource.id] ?? "text";
        body = JSON.stringify({ [field]: inputs[resource.id] ?? "" });
      } else if (QUERY_PARAMS_BY_RESOURCE[resource.id]) {
        url = `${resource.url}?${inputs[resource.id] ?? QUERY_PARAMS_BY_RESOURCE[resource.id]}`;
      }

      const response = await fetchWithPayment(url, {
        method: resource.method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });

      if (!response.ok) {
        throw new Error(`Resource returned ${response.status}`);
      }

      const settlement = httpClient.getPaymentSettleResponse((name) => response.headers.get(name));
      const stellarTxHash = settlement?.transaction;
      if (!stellarTxHash) {
        throw new Error("No settlement transaction hash returned by the facilitator");
      }

      // Not every resource returns JSON (generate-image returns raw bytes) —
      // parse by content type, same fix applied server-side in
      // nymor-server's payment.ts after this exact mismatch broke a real
      // paid image-generation call.
      const contentType = response.headers.get("content-type") ?? "";
      const result: CallResult = contentType.includes("application/json")
        ? { kind: "json", data: await response.json() }
        : {
            kind: "image",
            dataUri: `data:${contentType};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`,
          };

      setCalls((prev) => ({ ...prev, [resource.id]: { status: "ok", result, stellarTxHash } }));
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
                  {r.method === "POST" && (
                    <textarea
                      className="resource-input"
                      value={inputs[r.id] ?? ""}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      rows={2}
                    />
                  )}
                  {r.method === "GET" && QUERY_PARAMS_BY_RESOURCE[r.id] && (
                    <input
                      className="resource-input"
                      value={inputs[r.id] ?? ""}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="query params, e.g. lat=51.5&lon=-0.12"
                    />
                  )}
                  <button
                    className="btn"
                    disabled={call.status === "paying"}
                    onClick={() => void payFor(r)}
                  >
                    {call.status === "paying" ? "Paying…" : `Pay $${r.price_usd.toFixed(2)}`}
                  </button>
                  {call.status === "ok" && call.result.kind === "json" && (
                    <div className="call-result">
                      <pre>{JSON.stringify(call.result.data, null, 2)}</pre>
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${call.stellarTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        view settled tx
                      </a>
                    </div>
                  )}
                  {call.status === "ok" && call.result.kind === "image" && (
                    <div className="call-result">
                      <img src={call.result.dataUri} alt="Generated result" className="result-image" />
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
