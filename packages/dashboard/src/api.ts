import { config } from "./config.js";
import type { HorizonCreditEffect, NymorResource } from "./types.js";

// testnet USDC issuer — same constant used across nymor-server/-resources.
export const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export async function fetchRegistry(): Promise<NymorResource[]> {
  const res = await fetch(`${config.resourcesUrl}/registry`);
  if (!res.ok) throw new Error(`GET /registry failed: ${res.status}`);
  const data = (await res.json()) as { resources: NymorResource[] };
  return data.resources;
}

export async function fetchRecentUsdcCredits(limit = 20): Promise<HorizonCreditEffect[]> {
  const url = `${config.horizonUrl}/accounts/${config.sellerPayToAddress}/effects?order=desc&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Horizon effects fetch failed: ${res.status}`);
  const data = (await res.json()) as { _embedded: { records: HorizonCreditEffect[] } };
  return data._embedded.records.filter(
    (r) => r.type === "account_credited" && r.asset_code === "USDC" && r.asset_issuer === USDC_ISSUER,
  );
}

export function operationIdFromEffect(effect: HorizonCreditEffect): string {
  const href = effect._links.operation.href;
  return href.slice(href.lastIndexOf("/") + 1);
}

export function stellarExpertOpUrl(operationId: string): string {
  return `https://stellar.expert/explorer/testnet/op/${operationId}`;
}
