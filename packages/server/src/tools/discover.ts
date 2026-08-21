import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchRegistry } from "../registry.js";

export function registerDiscoverTool(server: McpServer) {
  server.registerTool(
    "nymor.discover",
    {
      title: "Discover paid resources",
      description:
        "Lists paid API resources known to Nymor, optionally filtered by a free-text query against name/description/id.",
      inputSchema: { query: z.string().optional() },
    },
    async ({ query }) => {
      const resources = await searchRegistry(query);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              resources.map((r) => ({
                id: r.id,
                name: r.name,
                description: r.description,
                price_usd: r.price_usd,
                network: r.network,
                method: r.method,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
