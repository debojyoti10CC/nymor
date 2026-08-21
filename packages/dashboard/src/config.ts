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
};
