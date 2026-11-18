import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { startRun } from "../../../admin/runs/lifecycle/index.js";
import type { Deps, RunAugmentEngine } from "../../../augment/index.js";
import { defaultEffort, effortChoice, efforts } from "./effort/index.js";
import { buildError, buildReply } from "./envelope/index.js";

/** 도구 설명(호스트 모델이 읽는다). effort 는 「제공하는 정보 수준」으로 설명하고 예시는 싣지 않는다. 설계: docs/mcp-design.md. */
export const description = [
  "Retrieves background context from specialist, private or recent material to ground your answer.",
  "It returns context only, never an answer: write the answer yourself from it.",
  "Use it for each information need your answer depends on that general knowledge cannot cover; skip it for general knowledge and small talk.",
  "One call serves one information need, so a question that holds several needs may take several calls, one per need.",
  "Do not repeat a call for the same need with a rephrased query at the same effort: if the context is thin, call again with a higher effort,",
  "or answer with what you have and say what is missing.",
  "If the reply starts with coverage=none, do not retry for that need; answer from your own knowledge.",
  "WARNING, long-running: any effort above light is a long job. In one measurement on a shared model server, light took 16-23 seconds, middle about 20 minutes and high about 80 minutes.",
  "Most MCP clients stop waiting after about a minute and report a timeout, while the work keeps running on the server and cannot be cancelled.",
  "Use middle, high or xhigh only when the user has accepted a long wait; otherwise use light and say what is missing."
].join(" ");

const queryDescription = "The information need, in the user's own words and terms. Keep names, numbers and technical terms as written; do not reduce it to bare keywords.";

const effortDescription = [
  "Optional, default light. How much information to provide for the query; each step up is more thorough and slower.",
  "light: the information that answers what the query literally asks.",
  "middle: also the information hidden inside the query, the sub-needs it implies but does not state, found by breaking the query down.",
  "high: information checked internally against the query: gaps found in what was gathered are filled before it is returned.",
  "xhigh: the same with stronger checking and more refined information; the slowest.",
  "Time: light takes seconds to tens of seconds; middle, high and xhigh can take tens of minutes to over an hour, beyond most clients' timeout, so do not choose them unless the user accepted a long wait.",
  "Pick the level of information your answer needs; when unsure, use light. A high reply that says next: effort=xhigh could not be fully verified."
].join(" ");

/**
 * 이 서버가 제공하는 유일한 도구. 입력은 질의(정보 필요)와 선택 effort 뿐이고, 출력은 증강된 컨텍스트다(답변은 돌려주지 않는다).
 * effort 가 모드와 평가 · 보강 한도를 정한다(`effort/`). 저장된 관리자 모드는 MCP 호출에 적용하지 않는다.
 * 응답은 고정 머리 + 컨텍스트(`envelope/`). 호출은 관리자 「실행 로그」에 출처 mcp 와 effort 로 남고 최종 답변(증강 전 · 후)은 만들지 않는다.
 * engine 은 시험용으로 바꿔 끼운다(기본은 실제 증강 경로).
 */
export function registerAugmentTool(server: McpServer, deps: Deps, engine?: RunAugmentEngine) {
  server.registerTool(
    "augment_context",
    {
      description,
      inputSchema: {
        query: z.string().min(1).describe(queryDescription),
        effort: z.enum(efforts).optional().describe(effortDescription)
      }
    },
    async ({ query, effort = defaultEffort }) => {
      const started = Date.now();
      const { done } = await startRun(deps, query, undefined, effortChoice(effort), engine, { source: "mcp", effort });
      const outcome = await done;
      // 계획 모드에서 질의 분석이 실패하면 빈 결과로 숨기지 않고 오류로 낸다(실행 로그에도 error 로 남는다).
      if (outcome.error !== null || outcome.result === null) return { isError: true, content: [{ type: "text" as const, text: buildError(outcome.error ?? "no result") }] };
      return { content: [{ type: "text" as const, text: buildReply({ effort, result: outcome.result, plan: outcome.plan, elapsedMs: Date.now() - started }) }] };
    }
  );
}
