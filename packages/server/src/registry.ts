import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";

export const resourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url(),
  method: z.enum(["GET", "POST"]),
  price_usd: z.number().positive(),
  network: z.string().min(1),
});

export type NymorResource = z.infer<typeof resourceSchema>;

const registryFileSchema = z.object({
  resources: z.array(resourceSchema),
});

const DEFAULT_REGISTRY: z.infer<typeof registryFileSchema> = {
  resources: [
    {
      id: "xlm-price",
      name: "Live XLM/USD Price",
      description: "Real-time Stellar Lumens price in USD, sourced from CoinGecko.",
      url: "http://localhost:3001/xlm-price",
      method: "GET",
      price_usd: 0.01,
      network: "stellar:testnet",
    },
    {
      id: "summarize",
      name: "Text Summarization",
      description: "Summarizes arbitrary text using a real LLM (OpenRouter).",
      url: "http://localhost:3001/summarize",
      method: "POST",
      price_usd: 0.02,
      network: "stellar:testnet",
    },
    {
      id: "stellar-balance",
      name: "Stellar Account Balance",
      description:
        "Looks up a Stellar testnet account's real balances via Horizon. Requires an ?address=G... query parameter.",
      url: "http://localhost:3001/stellar-balance",
      method: "GET",
      price_usd: 0.01,
      network: "stellar:testnet",
    },
    {
      id: "generate-image",
      name: "AI Image Generation",
      description: "Generates a real image from a text prompt via Pollinations.ai. Returns image bytes.",
      url: "http://localhost:3001/generate-image",
      method: "POST",
      price_usd: 0.03,
      network: "stellar:testnet",
    },
    {
      id: "weather",
      name: "Current Weather",
      description:
        "Real current weather for a location via Open-Meteo. Requires ?lat=&lon= query parameters.",
      url: "http://localhost:3001/weather",
      method: "GET",
      price_usd: 0.01,
      network: "stellar:testnet",
    },
  ],
};

async function ensureRegistryFile(path: string): Promise<void> {
  if (!existsSync(path)) {
    await writeFile(path, JSON.stringify(DEFAULT_REGISTRY, null, 2), "utf-8");
    logger.info({ path }, "registry: created default registry file");
  }
}

export async function loadRegistry(): Promise<NymorResource[]> {
  await ensureRegistryFile(config.registryPath);
  const raw = await readFile(config.registryPath, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`registry.json is not valid JSON: ${(err as Error).message}`);
  }

  const result = registryFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`registry.json failed schema validation: ${result.error.message}`);
  }

  return result.data.resources;
}

export async function findResource(resourceId: string): Promise<NymorResource | undefined> {
  const resources = await loadRegistry();
  return resources.find((r) => r.id === resourceId);
}

export async function searchRegistry(query?: string): Promise<NymorResource[]> {
  const resources = await loadRegistry();
  if (!query || query.trim() === "") return resources;

  const needle = query.toLowerCase();
  return resources.filter(
    (r) =>
      r.name.toLowerCase().includes(needle) ||
      r.description.toLowerCase().includes(needle) ||
      r.id.toLowerCase().includes(needle),
  );
}

export async function registerResource(input: unknown): Promise<NymorResource> {
  const parsedResource = resourceSchema.parse(input);

  const resources = await loadRegistry();
  if (resources.some((r) => r.id === parsedResource.id)) {
    throw new Error(`Resource with id "${parsedResource.id}" already exists in the registry`);
  }

  const updated = { resources: [...resources, parsedResource] };
  const validated = registryFileSchema.parse(updated);
  await writeFile(config.registryPath, JSON.stringify(validated, null, 2), "utf-8");
  logger.info({ resourceId: parsedResource.id }, "registry: registered new resource");

  return parsedResource;
}
