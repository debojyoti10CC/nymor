import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { config } from "./config.js";

export const paymentMiddleware = paymentMiddlewareFromConfig(
  {
    "GET /xlm-price": {
      accepts: {
        scheme: "exact",
        price: "$0.01",
        network: config.network,
        payTo: config.sellerPayToAddress,
      },
    },
    "POST /summarize": {
      accepts: {
        scheme: "exact",
        price: "$0.02",
        network: config.network,
        payTo: config.sellerPayToAddress,
      },
    },
  },
  new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
    // OZ Channels requires Bearer auth on both testnet and mainnet.
    createAuthHeaders: async () => {
      const headers = { Authorization: `Bearer ${config.ozApiKey}` };
      return { verify: headers, settle: headers, supported: headers };
    },
  }),
  [{ network: config.network, server: new ExactStellarScheme() }],
);
