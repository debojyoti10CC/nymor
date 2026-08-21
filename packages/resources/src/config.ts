import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

// Anchor to the repo root explicitly rather than relying on dotenv's default
// process.cwd() lookup, which varies depending on how this process is
// launched (npm script, tsx, a process manager, etc).
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
  // OZ Channels requires Bearer auth on both testnet and mainnet — without it
  // the facilitator returns 401 and the server fails to start with
  // "no supported payment kinds loaded from any facilitator".
  ozApiKey: required("NYMOR_OZ_API_KEY"),
  sellerPayToAddress: required("NYMOR_SELLER_PAYTO_ADDRESS"),
  port: Number(process.env.NYMOR_RESOURCES_PORT ?? "3001"),
  // Same file nymor-server's registry.ts reads/writes — GET /registry serves
  // it read-only so nymor-dashboard doesn't need its own copy or its own
  // path into the server package.
  registryPath: required("NYMOR_REGISTRY_PATH"),
  // OpenRouter (OpenAI-compatible) powers /summarize with a free-tier model
  // so the resource makes a real LLM call at zero cost.
  openRouterApiKey: required("OPENROUTER_API_KEY"),
  openRouterModel: process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b:free",
  logLevel: process.env.NYMOR_LOG_LEVEL ?? "info",
  logPath: process.env.NYMOR_LOG_PATH ?? "./nymor.log",
};
