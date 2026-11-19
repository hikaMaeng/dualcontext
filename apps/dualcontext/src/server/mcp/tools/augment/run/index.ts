import type { McpEffort } from "dualcontext_domain/common";
import { progressBus, startRun } from "../../../../admin/runs/lifecycle/index.js";
import type { Deps, RunAugmentEngine } from "../../../../augment/index.js";
import { effortChoice } from "../effort/index.js";
import { buildError, buildReply } from "../envelope/index.js";

export type ToolArgs = { query: string; effort: McpEffort };

/** 도구 실행에 딸린 것: 취소 신호(클라이언트 이탈 · 취소 알림)와 진행 알림 통로. */
export type ToolContext = { signal: AbortSignal; progress: (message: string) => void };

export type ToolReply = { isError: boolean; text: string };

/** 도구 한 번을 실행하는 쪽. 엔진을 직접 돌리는 로컬 실행기와, 엔진 소유자에게 중계하는 실행기가 있다. */
export type ToolRunner = (args: ToolArgs, context: ToolContext) => Promise<ToolReply>;

/**
 * 엔진을 이 프로세스에서 직접 돌리는 실행기. 엔진 소유자(HTTP 서버 프로세스)가 쓴다.
 * 호출은 관리자 「실행 로그」에 출처 mcp 와 effort 로 남고 최종 답변(증강 전 · 후)은 만들지 않는다. 신호가 abort 되면 실행을 취소한다.
 * 계획 모드에서 질의 분석이 실패하면 빈 결과로 숨기지 않고 오류로 낸다(실행 로그에도 error 로 남는다).
 */
export function createLocalRunner(deps: Deps, engine?: RunAugmentEngine): ToolRunner {
  return async ({ query, effort }, { signal, progress }) => {
    const started = Date.now();
    const { runId, done, cancel } = await startRun(deps, query, undefined, effortChoice(effort), engine, { source: "mcp", effort });
    const onProgress = (event: { stage: string; detail?: string }) => progress(event.detail ? `${event.stage}: ${event.detail}` : event.stage);
    progressBus.on(String(runId), onProgress);
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
    try {
      const outcome = await done;
      if (outcome.error !== null || outcome.result === null) return { isError: true, text: buildError(outcome.error ?? "no result") };
      return { isError: false, text: buildReply({ effort, result: outcome.result, plan: outcome.plan, elapsedMs: Date.now() - started }) };
    } finally {
      progressBus.off(String(runId), onProgress);
      signal.removeEventListener("abort", cancel);
    }
  };
}
