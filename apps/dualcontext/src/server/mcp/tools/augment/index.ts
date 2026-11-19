import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RequestTracker } from "../../transport/index.js";
import { defaultEffort, efforts } from "./effort/index.js";
import type { ToolRunner } from "./run/index.js";

/** 도구 설명(호스트 모델이 읽는다). effort 는 「제공하는 정보 수준」으로 설명하고 예시는 싣지 않는다. 설계: docs/mcp-design.md. */
export const description = [
  "Retrieves background context from specialist, private or recent material to ground your answer.",
  "It returns context only, never an answer: write the answer yourself from it.",
  "Use it for each information need your answer depends on that general knowledge cannot cover; skip it for general knowledge and small talk.",
  "One call serves one information need, so a question that holds several needs may take several calls, one per need.",
  "Do not repeat a call for the same need with a rephrased query at the same effort: if the context is thin, call again with a higher effort,",
  "or answer with what you have and say what is missing.",
  "If the reply starts with coverage=none, do not retry for that need; answer from your own knowledge.",
  "WARNING, long-running: any effort above light is a long job. In one measurement on a shared model server, light took 16-23 seconds, middle 20 to 76 minutes and high about 80 minutes.",
  "Most MCP clients stop waiting after about a minute and report a timeout; the server then cancels the work, so a timed-out middle, high or xhigh call produces nothing.",
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
 * 실행은 runner 가 맡는다: 엔진 소유자 프로세스는 로컬 실행기, MCP stdio 프로세스는 엔진 소유자로 중계하는 실행기를 쓴다(`run/`, `relay/`).
 * 취소: 요청의 취소 신호(SDK)와 transport 어댑터가 등록한 요청별 신호(`tracker`, 요청 ID 0 취소 포함)를 합쳐 runner 에 넘긴다.
 * 진행: 클라이언트가 진행 토큰을 보냈을 때만 `notifications/progress`(단조 증가 progress)를 보낸다. 클라이언트가 `resetTimeoutOnProgress` 를 쓸 때만 시간 제한이 연장된다.
 */
export function registerAugmentTool(server: McpServer, runner: ToolRunner, tracker?: RequestTracker) {
  server.registerTool(
    "augment_context",
    {
      description,
      inputSchema: {
        query: z.string().min(1).describe(queryDescription),
        effort: z.enum(efforts).optional().describe(effortDescription)
      }
    },
    async ({ query, effort = defaultEffort }, extra) => {
      const own = tracker?.signalFor(extra.requestId);
      const signal = own ? AbortSignal.any([extra.signal, own]) : extra.signal;
      const token = extra._meta?.progressToken;
      let count = 0;
      const progress = (message: string) => {
        if (token === undefined) return;
        count += 1;
        void extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress: count, message } }).catch(() => undefined);
      };
      const reply = await runner({ query, effort }, { signal, progress });
      return { ...(reply.isError ? { isError: true } : {}), content: [{ type: "text" as const, text: reply.text }] };
    }
  );
}
