import express from "express";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { paymentMiddleware } from "./x402.js";
import { xlmPriceHandler } from "./resources/xlmPrice.js";
import { summarizeHandler } from "./resources/summarize.js";
import { registryHandler } from "./resources/registry.js";
import { stellarBalanceHandler } from "./resources/stellarBalance.js";
import { generateImageHandler } from "./resources/generateImage.js";
import { weatherHandler } from "./resources/weather.js";

const app = express();
app.use(express.json());

// nymor-dashboard's "try it yourself" panel pays for /xlm-price and
// /summarize directly from the browser, so every route needs CORS — not
// just /registry. X-PAYMENT is the request header the x402 client sends on
// the signed retry; PAYMENT-REQUIRED carries the 402 payload (@x402/express
// puts it in a header, not the JSON body — confirmed by inspecting a real
// 402 response, not assumed) and X-PAYMENT-RESPONSE carries the settlement
// info the client reads back afterwards (@x402/core's
// getPaymentSettleResponse). Browsers only expose response headers to
// fetch() that are explicitly listed here, so without
// Access-Control-Expose-Headers the client can't parse the payment
// requirements at all, and a real payment would settle but read back as a
// failure.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && config.corsAllowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  // @x402/fetch (v2.23.0) sets Access-Control-Expose-Headers on the *request*
  // it sends after signing a payment — a response-only header per the CORS
  // spec, almost certainly a bug in that library meant for a server-side
  // fetch proxy, harmless from Express here since nothing reads it. Without
  // allowlisting it, the browser's preflight for the retry rejects the whole
  // request before X-PAYMENT/PAYMENT-SIGNATURE (the headers that actually
  // matter) ever get sent.
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-PAYMENT, PAYMENT-SIGNATURE, Access-Control-Expose-Headers",
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "PAYMENT-REQUIRED, PAYMENT-RESPONSE, PAYMENT-SIGNATURE, X-PAYMENT-RESPONSE",
  );
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Free, read-only — must be registered before paymentMiddleware so it isn't
// gated by it (paymentMiddleware only matches the "METHOD /path" keys it was
// configured with, but keeping this above the gate makes that explicit).
app.get("/registry", registryHandler);

app.use(paymentMiddleware);

app.get("/xlm-price", xlmPriceHandler);
app.post("/summarize", summarizeHandler);
app.get("/stellar-balance", stellarBalanceHandler);
app.post("/generate-image", generateImageHandler);
app.get("/weather", weatherHandler);

app.listen(config.port, () => {
  logger.info({ port: config.port }, "nymor-resources listening");
});
