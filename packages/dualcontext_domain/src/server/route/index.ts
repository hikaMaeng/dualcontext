import type { Procedure, Researcher } from "../../common/index.js";

/** 라우팅 결과. mode 는 실제로 쓰인 방법(되돌림 포함)이다. */
export type Selection<T> = { mode: string; selected: T[] };

function keywordScore(query: string, keywords: string[]): number {
  const lowered = query.toLowerCase();
  return keywords.filter((keyword) => keyword.trim() !== "" && lowered.includes(keyword.trim().toLowerCase())).length;
}

/**
 * 키워드 라우팅(조사원). 키워드가 맞는 조사원만 점수순으로 상위 topK 개,
 * 맞는 것이 없으면 사용 가능한 전체의 앞 topK 개(fallback-all).
 */
export function routeResearchersByKeyword(query: string, researchers: Researcher[], topK: number): Selection<Researcher> {
  const enabled = researchers.filter((researcher) => researcher.enabled);
  const matched = enabled
    .map((researcher) => ({ researcher, score: keywordScore(query, researcher.keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.researcher);

  if (matched.length > 0) return { mode: "keyword", selected: matched.slice(0, topK) };
  if (enabled.length > 0) return { mode: "keyword-fallback-all", selected: enabled.slice(0, topK) };
  return { mode: "none", selected: [] };
}

/**
 * 키워드 라우팅(프로시저). 적용 조건이 맞은 프로시저가 있으면 그것들, 없으면 조건이 빈
 * (항상 적용) 프로시저만 남기고 상위 topK 개를 돌려준다.
 */
export function routeProceduresByKeyword(query: string, procedures: Procedure[], topK: number): Selection<Procedure> {
  const enabled = procedures.filter((procedure) => procedure.enabled);
  const matched = enabled.filter((procedure) => procedure.appliesWhen.length > 0 && keywordScore(query, procedure.appliesWhen) > 0);
  const chosen = matched.length > 0 ? matched : enabled.filter((procedure) => procedure.appliesWhen.length === 0);
  return { mode: "keyword", selected: chosen.slice(0, topK) };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

/** 임베딩 유사도 상위 topK. 벡터 차원이 다른 항목은 비교할 수 없으므로 건너뛴다. */
export function topKByEmbedding<T>(queryVector: number[], items: { item: T; vector: number[] }[], topK: number): T[] {
  return items
    .filter((entry) => entry.vector.length === queryVector.length)
    .map((entry) => ({ item: entry.item, score: cosine(queryVector, entry.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((entry) => entry.item);
}

/** LLM 이 답한 텍스트에서 후보 id 를 순서대로 뽑는다. 후보에 없는 id 와 중복은 버린다. */
export function parseIdSelection(text: string, validIds: number[], topK: number): number[] {
  const numbers = (text.match(/\d+/g) ?? []).map(Number);
  const seen = new Set<number>();
  for (const value of numbers) if (validIds.includes(value)) seen.add(value);
  return [...seen].slice(0, topK);
}
