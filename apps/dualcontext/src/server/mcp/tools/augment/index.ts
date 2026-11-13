import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type pg from "pg";
import { z } from "zod";
import { augment } from "../../../augment/index.js";

/** 이 서버가 제공하는 유일한 도구. 입력은 원래 질의 하나, 출력은 증강된 컨텍스트다. */
export function registerAugmentTool(server: McpServer, pool: pg.Pool) {
  server.registerTool(
    "augment_context",
    {
      description: "Augment a query: returns context built by routed researchers and librarian procedures through the writer.",
      inputSchema: { query: z.string().min(1) }
    },
    async ({ query }) => {
      const result = await augment(pool, query);
      return { content: [{ type: "text", text: result.context }] };
    }
  );
}
