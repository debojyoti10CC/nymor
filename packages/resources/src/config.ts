import "dotenv/config";

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
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  logLevel: process.env.NYMOR_LOG_LEVEL ?? "info",
  logPath: process.env.NYMOR_LOG_PATH ?? "./nymor.log",
};
