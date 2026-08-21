import express from "express";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { paymentMiddleware } from "./x402.js";
import { xlmPriceHandler } from "./resources/xlmPrice.js";
import { summarizeHandler } from "./resources/summarize.js";
import { registryHandler } from "./resources/registry.js";

const app = express();
app.use(express.json());

// Free, read-only — must be registered before paymentMiddleware so it isn't
// gated by it (paymentMiddleware only matches the "METHOD /path" keys it was
// configured with, but keeping this above the gate makes that explicit).
app.get("/registry", registryHandler);

app.use(paymentMiddleware);

app.get("/xlm-price", xlmPriceHandler);
app.post("/summarize", summarizeHandler);

app.listen(config.port, () => {
  logger.info({ port: config.port }, "nymor-resources listening");
});
