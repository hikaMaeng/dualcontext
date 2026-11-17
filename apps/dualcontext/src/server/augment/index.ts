import type { Answer, AugmentPair, AugmentResult, ContextMode, ContextPlanConfig, PlanTrace, WriterMode } from "dualcontext_domain/common";
import { planContext, type PlanOptions, type PlanProgress } from "dualcontext_domain/server";
import { runNodeKey } from "dualcontext_domain/common";
import { recordModel, type NodeSink } from "../plan/calls/index.js";
import { readPlanConfig } from "../plan/config/index.js";
import { buildKey, createPlanPorts, type BaseAugment } from "../plan/ports/index.js";
import { augment, type Deps } from "./base/index.js";

export { augment, type Deps } from "./base/index.js";

export type RunAugmentOptions = {
  writerId?: number;
  /** 없으면 config.mode(저장된 설정의 모드). */
  mode?: ContextMode;
  /** 없으면 저장된 설정(plan_config). 실행 로그는 이번 실행에만 쓰는 설정(override 적용)을 넘긴다. */
  config?: ContextPlanConfig;
  onProgress?: (event: PlanProgress) => Promise<void> | void;
  /** 계획 단계마다 부분 trace 를 건넨다(계획 모드만). 받는 쪽은 호출 안에서 바로 직렬화한다. */
  onTrace?: (trace: PlanTrace) => void;
  /** 노드 문서 조각(모델 호출 · 아이템 증강 상세)을 받는다. classic 이면 classic 노드 하나, 계획 모드면 analyze · item · dedupe · answer · evaluate 노드. 받는 쪽이 같은 키를 합친다. */
  onNode?: NodeSink;
};

export type RunAugmentOutcome = {
  result: AugmentResult;
  /** 계획 모드의 trace. classic 이면 null. */
  plan: PlanTrace | null;
  /** reevaluate 에서 마지막 라운드 답변이 최종 컨텍스트로 만든 것이면 그 답변(실행 로그가 「증강 후 답변」을 다시 만들지 않게). */
  answerAfter?: Answer;
};

/** 바꿔 끼울 수 있는 부품(테스트용). 기본은 실제 증강 경로와 도메인 플래너. */
export type RunAugmentEngine = { augment: BaseAugment; planContext: (query: string, options: PlanOptions) => Promise<{ context: string; trace: PlanTrace }> };
const realEngine: RunAugmentEngine = { augment, planContext };

/**
 * 계획 결과를 실행 로그 · MCP 가 쓰는 AugmentResult 로 바꾼다.
 * pairs 는 모든 아이템(사전 아이템 포함)의 쌍을 아이템 순서대로 평탄화하고 item 에 아이템 이름을 단다.
 * 자료는 어댑터 기록(builds)에서 가져오고, 기록이 없으면(만들지 않았거나 실패한 아이템) 계획 trace 의 요약에 자료 없이 둔다.
 * 실행 로그 목록 필터(researcher_names · procedure_names)는 이 pairs 에서 파생되므로 계획 실행도 같은 필터로 찾힌다.
 */
export function planResult(context: string, trace: PlanTrace, builds: Map<string, AugmentResult>): AugmentResult {
  const pairs: AugmentPair[] = [];
  let mode: WriterMode = "batch";
  for (const item of trace.items) {
    const built = builds.get(buildKey(item));
    if (built) {
      mode = built.writer.mode;
      pairs.push(...built.pairs.map((pair) => ({ ...pair, item: item.name })));
    } else pairs.push(...item.pairs.map((pair) => ({ ...pair, materials: [], item: item.name })));
  }
  return {
    context,
    routing: { researchers: [], procedures: [] },
    researcherRouting: "plan",
    pairs,
    writer: { mode, calls: trace.items.length }
  };
}

/**
 * 증강 진입점(MCP 도구 · 시험 실행). classic 이면 한 번의 기본 증강 그대로, decompose · reevaluate 면 도메인 플래너로
 * 아이템마다 기본 증강을 부르고 1차 아이템 컨텍스트를 합친다. 계획 모드에서 analyze 가 실패하면 오류를 숨기지 않고 던진다.
 */
export async function runAugment(deps: Deps, query: string, options: RunAugmentOptions = {}, engine: RunAugmentEngine = realEngine): Promise<RunAugmentOutcome> {
  const stored = options.config ?? (options.mode === "classic" ? null : await readPlanConfig(deps.pool));
  const mode = options.mode ?? stored?.mode ?? "classic";
  if (mode === "classic" || !stored) {
    // classic: 증강 한 번의 모델 호출(라우팅 · 프로시저 · 라이터)을 classic 노드로 남긴다. 라우팅 · 쌍 · 컨텍스트는 실행 행에 있다.
    const rec = recordModel(deps.model);
    try {
      return { result: await engine.augment({ ...deps, model: rec.model }, query, options.writerId), plan: null };
    } finally {
      options.onNode?.(runNodeKey.classic, { calls: rec.calls() });
    }
  }

  const config: ContextPlanConfig = { ...stored, mode };
  const ports = createPlanPorts(deps, options.writerId, config, engine.augment, options.onNode);
  const { context, trace } = await engine.planContext(query, { config, ports, ...(options.onProgress ? { onProgress: options.onProgress } : {}), ...(options.onTrace ? { onTrace: options.onTrace } : {}) });
  const result = planResult(context, trace, ports.record.builds);
  const last = ports.record.lastAnswer;
  // 마지막 라운드 답변이 정확히 최종 컨텍스트로 만든 것일 때만 넘긴다(같은 프롬프트 · 같은 입력이므로 다시 부를 이유가 없다).
  const reuse = mode === "reevaluate" && context.trim() !== "" && last !== null && last.context === context && last.answer.text !== null;
  return { result, plan: trace, ...(reuse ? { answerAfter: { ...last.answer, fromPlan: true } } : {}) };
}
