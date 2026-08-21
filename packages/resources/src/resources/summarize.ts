import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config.js";
import { logger } from "../logger.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

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
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Summarize the following text in 2-4 concise sentences. Return only the summary, no preamble.\n\n${parsed.data.text}`,
        },
      ],
    });

    const summary = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    res.json({ summary });
  } catch (err) {
    logger.error({ err }, "summarize: upstream (Anthropic) failure");
    res.status(503).json({ error: "upstream_unavailable" });
  }
}
