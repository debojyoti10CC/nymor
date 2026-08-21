import express from "express";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { paymentMiddleware } from "./x402.js";
import { xlmPriceHandler } from "./resources/xlmPrice.js";
import { summarizeHandler } from "./resources/summarize.js";

const app = express();
app.use(express.json());
app.use(paymentMiddleware);

app.get("/xlm-price", xlmPriceHandler);
app.post("/summarize", summarizeHandler);

app.listen(config.port, () => {
  logger.info({ port: config.port }, "nymor-resources listening");
});
