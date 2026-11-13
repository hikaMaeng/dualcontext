import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { augment, type Deps } from "../../../augment/index.js";

/** 이 서버가 제공하는 유일한 도구. 입력은 원래 질의 하나, 출력은 증강된 컨텍스트다. */
export function registerAugmentTool(server: McpServer, deps: Deps) {
  server.registerTool(
    "augment_context",
    {
      description: "Augment a query: returns context built by routed researchers and librarian procedures through the writer.",
      inputSchema: { query: z.string().min(1) }
    },
    async ({ query }) => {
      const result = await augment(deps, query);
      // 마땅한 조사원이 없으면 컨텍스트를 공급하지 않는다: 빈 결과를 돌려주고, 호출한 쪽은 자기 지식으로 답한다.
      return { content: result.context === "" ? [] : [{ type: "text", text: result.context }] };
    }
  );
}
