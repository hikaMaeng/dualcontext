import type { RouterStep } from "dualcontext_domain/common";
import { parseIdArray } from "dualcontext_domain/server";
import type { StepEnv, StepResult } from "../types.js";

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

/**
 * LLM 단계: 입력 후보 목록을 LLM 에 주고 id 배열로 고르게 한다. showScores 이면 앞 임베딩 단계의 유사도를 목록에 곁들인다.
 * 빈 배열(「없음」)은 allowNone 일 때만 존중한다. 아니면 무시하고 입력을 topK 개로 줄여 유지한다.
 * id 배열을 읽을 수 없으면 오류를 올려 단계의 onError 가 처리하게 한다.
 */
export async function runLlmStep<T extends { id: number }>(step: Extract<RouterStep, { type: "llm" }>, items: T[], env: StepEnv<T>): Promise<StepResult<T>> {
  const answer = await env.chat(
    fill(step.prompt, {
      query: env.query,
      topK: String(step.topK),
      candidates: items.map((item) => env.line(item, step.showScores ? env.scores.get(item.id) : undefined)).join("\n")
    })
  );
  const ids = parseIdArray(answer, items.map((item) => item.id), step.topK);
  if (ids === null) throw new Error("LLM answer had no id array");
  if (ids.length === 0) return step.allowNone ? { items: [] } : { items: items.slice(0, step.topK), note: "empty-answer-ignored" };
  return { items: ids.map((id) => items.find((item) => item.id === id) as T) };
}
