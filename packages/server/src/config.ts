import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

// MCP clients spawn this process with an unpredictable working directory
// (varies by client, launch method, OS) — relying on dotenv's default
// process.cwd() lookup silently loads no .env at all in that case. Anchor
// to the repo root (two levels up from packages/server/src) explicitly.
loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`,
    );
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
  network: requiredCaip2Network("NYMOR_NETWORK"),
  stellarRpcUrl: required("NYMOR_STELLAR_RPC_URL"),
  facilitatorUrl: required("NYMOR_FACILITATOR_URL"),
  buyerPrivateKey: required("NYMOR_BUYER_STELLAR_PRIVATE_KEY"),
  sessionCapUsd: Number(process.env.NYMOR_SESSION_CAP_USD ?? "1.00"),
  perCallMaxUsd: Number(process.env.NYMOR_PER_CALL_MAX_USD ?? "0.05"),
  ledgerPath: process.env.NYMOR_LEDGER_PATH ?? "./nymor.ledger.json",
  registryPath: process.env.NYMOR_REGISTRY_PATH ?? "./nymor.registry.json",
  logLevel: process.env.NYMOR_LOG_LEVEL ?? "info",
  logPath: process.env.NYMOR_LOG_PATH ?? "./nymor.log",
};
