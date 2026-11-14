import type { RouterStep } from "dualcontext_domain/common";
import type { StepEnv, StepResult } from "../types.js";

/** 키워드 단계: 후보의 키워드(적용 조건)가 질의에 들어 있는 정도로 상위 topK 를 남긴다. 맞는 것이 없으면 비운다. */
export async function runKeywordStep<T extends { id: number }>(step: Extract<RouterStep, { type: "keyword" }>, items: T[], env: StepEnv<T>): Promise<StepResult<T>> {
  return { items: env.keywordTopK(items, step.topK) };
}
