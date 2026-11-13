import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type pg from "pg";
import { registerAugmentTool } from "./tools/augment/index.js";

/** Builds the MCP server. It exposes exactly one tool; transport is chosen by the caller. */
export function createMcpServer(pool: pg.Pool) {
  const server = new McpServer({ name: "dualcontext", version: "0.1.0" });
  registerAugmentTool(server, pool);
  return server;
}
