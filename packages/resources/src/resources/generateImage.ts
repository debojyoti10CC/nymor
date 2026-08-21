import type { Request, Response } from "express";
import { z } from "zod";
import { logger } from "../logger.js";

const POLLINATIONS_URL = "https://image.pollinations.ai/prompt";
const TIMEOUT_MS = 20_000; // image generation is slower than the other resources

const requestSchema = z.object({
  prompt: z.string().min(1).max(1000),
});

// Real image generation, no API key needed. Returns the image itself
// (binary, not a base64 JSON blob) since that's what a caller actually
// wants from this resource.
export async function generateImageHandler(req: Request, res: Response) {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_input",
      details: parsed.error.issues.map((i) => i.message).join("; "),
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${POLLINATIONS_URL}/${encodeURIComponent(parsed.data.prompt)}`;
    const upstream = await fetch(url, { signal: controller.signal });
    if (!upstream.ok) {
      throw new Error(`Pollinations returned ${upstream.status}`);
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.send(bytes);
  } catch (err) {
    logger.error({ err }, "generate-image: upstream (Pollinations) unavailable");
    res.status(503).json({ error: "upstream_unavailable" });
  } finally {
    clearTimeout(timeout);
  }
}
