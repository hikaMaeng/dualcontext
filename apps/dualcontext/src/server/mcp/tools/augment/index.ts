import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAugment, type Deps } from "../../../augment/index.js";

/**
 * 이 서버가 제공하는 유일한 도구. 입력은 원래 질의 하나, 출력은 증강된 컨텍스트다.
 * 모드는 저장된 계획 설정(plan_config.mode)을 따른다: classic 이면 기존 경로, 계획 모드면 1차 아이템 컨텍스트를 합친 것.
 * reevaluate 모드의 답변 · 평가는 컨텍스트를 고르는 데만 쓰고 돌려주지 않는다(답은 호출한 쪽 LLM 이 만든다).
 */
export function registerAugmentTool(server: McpServer, deps: Deps) {
  server.registerTool(
    "augment_context",
    {
      description: "Augment a query: returns context built by routed researchers and librarian procedures through the writer.",
      inputSchema: { query: z.string().min(1) }
    },
    async ({ query }) => {
      const { result } = await runAugment(deps, query);
      // 마땅한 조사원이 없으면 컨텍스트를 공급하지 않는다: 빈 결과를 돌려주고, 호출한 쪽은 자기 지식으로 답한다.
      return { content: result.context === "" ? [] : [{ type: "text", text: result.context }] };
    }
  );
}
