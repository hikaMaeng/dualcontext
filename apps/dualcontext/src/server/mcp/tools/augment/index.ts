import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { startRun } from "../../../admin/runs/lifecycle/index.js";
import type { Deps, RunAugmentEngine } from "../../../augment/index.js";

/**
 * 이 서버가 제공하는 유일한 도구. 입력은 원래 질의 하나, 출력은 증강된 컨텍스트다(답변은 돌려주지 않는다).
 * 모드는 저장된 계획 설정(plan_config.mode)을 따른다: classic 이면 기존 경로, 계획 모드면 1차 아이템 컨텍스트를 합친 것.
 * 호출은 관리자 「실행 로그」에 출처 mcp 로 남는다(시험 실행과 같은 목록). 최종 답변(증강 전 · 후)은 만들지 않는다.
 * engine 은 시험용으로 바꿔 끼운다(기본은 실제 증강 경로).
 */
export function registerAugmentTool(server: McpServer, deps: Deps, engine?: RunAugmentEngine) {
  server.registerTool(
    "augment_context",
    {
      description: "Augment a query: returns context built by routed researchers and librarian procedures through the writer.",
      inputSchema: { query: z.string().min(1) }
    },
    async ({ query }) => {
      const { done } = await startRun(deps, query, undefined, {}, engine, "mcp");
      const outcome = await done;
      // 계획 모드에서 질의 분석이 실패하면 빈 결과로 숨기지 않고 오류로 낸다(실행 로그에도 error 로 남는다).
      if (outcome.error !== null) throw new Error(outcome.error);
      const context = outcome.result?.context ?? "";
      // 마땅한 조사원이 없으면 컨텍스트를 공급하지 않는다: 빈 결과를 돌려주고, 호출한 쪽은 자기 지식으로 답한다.
      return { content: context === "" ? [] : [{ type: "text" as const, text: context }] };
    }
  );
}
