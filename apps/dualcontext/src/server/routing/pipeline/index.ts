import type { StageConfig, StepTrace } from "dualcontext_domain/common";
import type { ScoredId, Selection } from "dualcontext_domain/server";
import { runEmbeddingStep } from "../steps/embedding/index.js";
import { runKeywordStep } from "../steps/keyword/index.js";
import { runLlmStep } from "../steps/llm/index.js";
import type { StepEnv, StepResult } from "../steps/types.js";

export type PipelineOptions = {
  /** 복합 질의의 하위 질문 하나를 라우팅한다: parts 가 켜진 단계만 쓰고 결과를 topK 개로 자른다. */
  part?: { topK: number };
};

/**
 * 단계 파이프라인 실행. 후보 전체에서 시작해 단계마다 더 좁힌다. 단계가 비워 버리면 거기서 끝낸다(남은 단계는 돌지 않는다).
 * 단계가 실패하면 그 단계의 onError 대로 처리하고(건너뜀, 키워드로 대체, 비움) 사실을 단계 기록과 mode 에 남긴다. 조용히 넘기지 않는다.
 * 결과의 scores 는 첫 임베딩 단계가 입력 후보 전부에 매긴 점수이고, selected 는 파이프라인이 최종으로 남긴 것을 가리킨다.
 */
export async function runPipeline<T extends { id: number }>(stage: StageConfig, candidates: T[], env: Omit<StepEnv<T>, "scores">, options: PipelineOptions = {}): Promise<Selection<T>> {
  if (candidates.length === 0) return { mode: "none", selected: [] };
  const steps = options.part ? stage.steps.filter((step) => step.parts) : stage.steps;
  if (steps.length === 0) return { mode: "none(no-step)", selected: [] };

  const scores = new Map<number, number>();
  let firstScores: ScoredId[] | undefined;
  let current = candidates;
  const traces: StepTrace[] = [];
  const labels: string[] = [];
  const stepEnv: StepEnv<T> = { ...env, scores };

  for (const step of steps) {
    if (current.length === 0) break;
    const started = Date.now();
    let result: StepResult<T>;
    let note: string | undefined;
    try {
      result = step.type === "embedding" ? await runEmbeddingStep(step, current, stepEnv) : step.type === "keyword" ? await runKeywordStep(step, current, stepEnv) : await runLlmStep(step, current, stepEnv);
      note = result.note;
    } catch (error) {
      const reason = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 80);
      if (step.onError === "keyword") result = { items: env.keywordTopK(current, step.topK) };
      else if (step.onError === "none") result = { items: [] };
      else result = { items: current };
      note = `failed(${reason})->${step.onError}`;
    }
    if (result.scores) {
      firstScores ??= result.scores;
      for (const entry of result.scores) scores.set(entry.id, entry.score);
    }
    traces.push({ type: step.type, input: current.length, output: result.items.length, ms: Date.now() - started, ...(note ? { note } : {}) });
    labels.push(note?.startsWith("failed") ? `${step.type}-${note}` : step.type);
    current = result.items;
  }

  const selected = options.part ? current.slice(0, options.part.topK) : current;
  return {
    mode: labels.join(">"),
    selected,
    scores: firstScores?.map((entry) => ({ ...entry, selected: selected.some((item) => item.id === entry.id) })),
    steps: traces
  };
}
