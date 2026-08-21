import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSpendStatus } from "../ledger.js";

export function registerSpendStatusTool(server: McpServer) {
  server.registerTool(
    "nymor.spend_status",
    {
      title: "Spend status",
      description: "Returns the current persisted session spend: cap, spent, remaining, and entry count.",
      inputSchema: {},
    },
    async () => {
      const status = await getSpendStatus();
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    },
  );
}
