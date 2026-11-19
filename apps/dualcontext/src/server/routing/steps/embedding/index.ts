import type { RouterStep } from "dualcontext_domain/common";
import { rankByEmbedding, selectByEmbedding, settled } from "dualcontext_domain/server";
import type { StepEnv, StepResult } from "../types.js";

/** 임베딩 단계: 입력 후보를 질의와의 코사인으로 줄 세워 minScore, margin, topK 규칙으로 남긴다. 점수는 입력 후보 전부에 대해 돌려준다. */
export async function runEmbeddingStep<T extends { id: number }>(step: Extract<RouterStep, { type: "embedding" }>, items: T[], env: StepEnv<T>): Promise<StepResult<T>> {
  // 두 호출은 병렬이고, 하나가 실패해도 다른 하나가 정착한 뒤에 던진다(고아 호출을 남기지 않는다).
  const queryPromise = env.embedQuery();
  const vectorsPromise = env.vectorsOf(items);
  await settled([queryPromise, vectorsPromise]);
  const [queryVector, vectors] = [await queryPromise, await vectorsPromise];
  const ranked = rankByEmbedding(queryVector, items.map((item, index) => ({ item, vector: vectors[index] })));
  const picked = selectByEmbedding(ranked, step);
  return {
    items: picked.map((entry) => entry.item),
    scores: ranked.map((entry) => ({ id: entry.item.id, score: entry.score, selected: picked.some((chosen) => chosen.item === entry.item) }))
  };
}
