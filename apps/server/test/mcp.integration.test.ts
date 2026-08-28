import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

// Proves nymor-server actually works as an MCP server, not just as a set of
// directly-importable modules: spawns the built dist/index.js exactly as a
// real MCP client (Claude Code, Claude Desktop) would, over the real stdio
// transport, and drives it through the real JSON-RPC protocol. Requires
// nymor-resources running on NYMOR_RESOURCES_PORT and a fully-configured
// .env (real money moves), so it's gated the same way as the payment test.
const runIntegration = process.env.RUN_INTEGRATION === "1";

const serverEntrypoint = fileURLToPath(new URL("../dist/index.js", import.meta.url));

describe.runIf(runIntegration)("MCP protocol integration (real stdio transport)", () => {
  it("lists tools, discovers resources, and pays for xlm-price over the real MCP protocol", async () => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");

    const transport = new StdioClientTransport({ command: "node", args: [serverEntrypoint] });
    const client = new Client({ name: "nymor-mcp-integration-test", version: "1.0.0" });
    await client.connect(transport);

    try {
      const tools = await client.listTools();
      const toolNames = tools.tools.map((t) => t.name);
      expect(toolNames).toEqual(
        expect.arrayContaining([
          "nymor.discover",
          "nymor.pay_and_call",
          "nymor.spend_status",
          "nymor.register_resource",
        ]),
      );

      const discover = await client.callTool({ name: "nymor.discover", arguments: {} });
      const content = discover.content as Array<{ type: string; text: string }>;
      const resources = JSON.parse(content[0].text);
      expect(resources.some((r: { id: string }) => r.id === "xlm-price")).toBe(true);

      const paid = await client.callTool({
        name: "nymor.pay_and_call",
        arguments: { resource_id: "xlm-price" },
      });
      const paidContent = paid.content as Array<{ type: string; text: string }>;
      const result = JSON.parse(paidContent[0].text);

      expect(result.status).toBe("ok");
      expect(result.stellar_tx_hash).toMatch(/^[a-f0-9]{64}$/i);
      expect(typeof result.data.price).toBe("number");

      console.log(`MCP-driven settled tx: https://stellar.expert/explorer/testnet/tx/${result.stellar_tx_hash}`);
    } finally {
      await client.close();
    }
  }, 30_000);
});
