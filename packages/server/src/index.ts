import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { registerDiscoverTool } from "./tools/discover.js";
import { registerPayAndCallTool } from "./tools/payAndCall.js";
import { registerSpendStatusTool } from "./tools/spendStatus.js";
import { registerRegisterResourceTool } from "./tools/registerResource.js";

async function main() {
  const server = new McpServer({ name: "nymor-mcp", version: "0.1.0" });

  registerDiscoverTool(server);
  registerPayAndCallTool(server);
  registerSpendStatusTool(server);
  registerRegisterResourceTool(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info({ network: config.network }, "nymor-mcp connected over stdio");
}

main().catch((err) => {
  logger.error({ err }, "nymor-mcp failed to start");
  process.exit(1);
});
