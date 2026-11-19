import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestTracker } from "./transport/index.js";
import { registerAugmentTool } from "./tools/augment/index.js";
import type { ToolRunner } from "./tools/augment/run/index.js";

/** Builds the MCP server. It exposes exactly one tool; transport is chosen by the caller. */
export function createMcpServer(runner: ToolRunner, tracker?: RequestTracker) {
  const server = new McpServer({ name: "dualcontext", version: "0.1.0" });
  registerAugmentTool(server, runner, tracker);
  return server;
}
