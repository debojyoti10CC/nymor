import type { Request, Response } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { config } from "../config.js";
import { logger } from "../logger.js";

// OpenRouter exposes an OpenAI-compatible API; config.openRouterModel is a
// ":free" model id so real inference happens at zero cost.
const openRouter = new OpenAI({
  apiKey: config.openRouterApiKey,
  baseURL: "https://openrouter.ai/api/v1",
});

const requestSchema = z.object({
  text: z.string().min(1).max(20_000),
});

export async function summarizeHandler(req: Request, res: Response) {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_input",
      details: parsed.error.issues.map((i) => i.message).join("; "),
    });
    return;
  }

  try {
    const completion = await openRouter.chat.completions.create({
      model: config.openRouterModel,
      // The default free model is a reasoning model that spends tokens on
      // internal reasoning before the final answer — 512 was too tight and
      // left message.content empty. 1024 leaves headroom for both.
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Summarize the following text in 2-4 concise sentences. Return only the summary, no preamble.\n\n${parsed.data.text}`,
        },
      ],
    });

    const summary = completion.choices[0]?.message?.content?.trim();
    if (!summary) {
      throw new Error("OpenRouter returned no summary content");
    }

    res.json({ summary });
  } catch (err) {
    logger.error({ err }, "summarize: upstream (OpenRouter) failure");
    res.status(503).json({ error: "upstream_unavailable" });
  }
}
