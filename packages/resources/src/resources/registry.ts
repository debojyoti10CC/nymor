import type { Request, Response } from "express";
import { readFile } from "node:fs/promises";
import { config } from "../config.js";
import { logger } from "../logger.js";

// Read-only mirror of nymor-server's registry.json — nymor-dashboard's
// marketplace panel reads real resource data through this route instead of
// duplicating the file or reaching into the server package's filesystem
// path directly.
export async function registryHandler(_req: Request, res: Response): Promise<void> {
  try {
    const raw = await readFile(config.registryPath, "utf-8");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(raw);
  } catch (err) {
    logger.error({ err }, "registry: failed to read registry file");
    res.status(503).json({
      error: "REGISTRY_UNAVAILABLE",
      message: "Could not read the resource registry.",
    });
  }
}
