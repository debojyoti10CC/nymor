import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResource, resourceSchema } from "../registry.js";

const inputShape = resourceSchema.shape;

export function registerRegisterResourceTool(server: McpServer) {
  server.registerTool(
    "nymor.register_resource",
    {
      title: "Register a new paid resource",
      description: "Adds a new paid resource to the Nymor registry so it becomes discoverable and payable.",
      inputSchema: inputShape,
    },
    async (input) => {
      try {
        const resource = await registerResource(input);
        return { content: [{ type: "text", text: JSON.stringify(resource, null, 2) }] };
      } catch (err) {
        const details = err instanceof Error ? err.message : String(err);
        const nymorError = { code: "INVALID_INPUT" as const, details };
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify(nymorError) }],
        };
      }
    },
  );
}
