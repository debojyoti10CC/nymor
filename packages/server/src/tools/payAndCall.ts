import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findResource } from "../registry.js";
import { reserveSpend, confirmReservation, releaseReservation, getSpendStatus } from "../ledger.js";
import { payAndFetch } from "../payment.js";
import { NymorException, type NymorError } from "../errors.js";
import { logger } from "../logger.js";

function errorContent(nymorError: NymorError) {
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(nymorError) }] };
}

export function registerPayAndCallTool(server: McpServer) {
  server.registerTool(
    "nymor.pay_and_call",
    {
      title: "Pay for and call a resource",
      description:
        "Looks up a registered paid resource, checks it against the persisted spend policy, and if allowed, " +
        "pays for it over x402/Stellar and returns the real resource response. Refuses (without paying) if the " +
        "session budget would be exceeded.",
      inputSchema: {
        resource_id: z.string(),
        params: z.record(z.unknown()).optional(),
      },
    },
    async ({ resource_id, params }) => {
      const resource = await findResource(resource_id);
      if (!resource) {
        return errorContent({ code: "RESOURCE_NOT_FOUND", resource_id });
      }

      const reservation = await reserveSpend(resource_id, resource.price_usd);
      if (!reservation.allowed) {
        return errorContent({
          code: "BUDGET_EXCEEDED",
          price_usd: resource.price_usd,
          remaining_usd: reservation.remainingUsd,
        });
      }

      try {
        const { data, stellarTxHash } = await payAndFetch(
          resource_id,
          resource.url,
          resource.method,
          resource.method === "POST" ? params : undefined,
        );

        await confirmReservation(reservation.reservationId, stellarTxHash);
        const status = await getSpendStatus();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { status: "ok", data, stellar_tx_hash: stellarTxHash, spent_usd: status.spent_usd },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const reason = err instanceof NymorException ? err.message : err instanceof Error ? err.message : String(err);
        await releaseReservation(reservation.reservationId, reason);
        logger.error({ resource_id, reason }, "pay_and_call: payment failed, reservation released");

        if (err instanceof NymorException) {
          return errorContent(err.nymorError);
        }
        return errorContent({ code: "PAYMENT_FAILED", reason });
      }
    },
  );
}
