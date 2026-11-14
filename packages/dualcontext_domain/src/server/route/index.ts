import type { Procedure, Researcher, StepTrace } from "../../common/index.js";

/** 후보 하나의 점수(임베딩 방식에서만). */
export type ScoredId = { id: number; score: number; selected: boolean };

/** 라우팅 결과. mode 는 실제로 쓰인 단계들(건너뜀·실패 포함), scores 는 임베딩 단계가 있었을 때 그 단계 입력 후보의 점수, steps 는 단계별 기록이다. */
export type Selection<T> = { mode: string; selected: T[]; scores?: ScoredId[]; steps?: StepTrace[] };

function keywordScore(query: string, keywords: string[]): number {
  const lowered = query.toLowerCase();
  return keywords.filter((keyword) => keyword.trim() !== "" && lowered.includes(keyword.trim().toLowerCase())).length;
}

/**
 * 키워드 라우팅(조사원). 키워드가 맞는 조사원만 점수순으로 상위 topK 개.
 * 맞는 것이 없으면 선택하지 않는다(keyword-none): 마땅한 조사원이 없는 질의에 임의의 조사원을 붙이지 않는다.
 */
export function routeResearchersByKeyword(query: string, researchers: Researcher[], topK: number): Selection<Researcher> {
  const enabled = researchers.filter((researcher) => researcher.enabled);
  const matched = enabled
    .map((researcher) => ({ researcher, score: keywordScore(query, researcher.keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.researcher);

  if (matched.length > 0) return { mode: "keyword", selected: matched.slice(0, topK) };
  return { mode: enabled.length > 0 ? "keyword-none" : "none", selected: [] };
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

/** 임베딩 유사도순으로 모든 후보에 점수를 매긴다. 벡터 차원이 다른 항목은 비교할 수 없으므로 건너뛴다. */
export function rankByEmbedding<T>(queryVector: number[], items: { item: T; vector: number[] }[]): { item: T; score: number }[] {
  return items
    .filter((entry) => entry.vector.length === queryVector.length)
    .map((entry) => ({ item: entry.item, score: cosine(queryVector, entry.vector) }))
    .sort((a, b) => b.score - a.score);
}

/** 임베딩 유사도 상위 topK(최소 유사도 minScore 이상만). */
export function topKByEmbedding<T>(queryVector: number[], items: { item: T; vector: number[] }[], topK: number, minScore = 0): T[] {
  return rankByEmbedding(queryVector, items)
    .filter((entry) => entry.score >= minScore)
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

/**
 * 임베딩 단계의 선택 규칙. ranked 는 점수 내림차순이다.
 * minScore 이상이고 최고 점수에서 margin 안이며, 그중 위에서 topK 개. margin 1 이면 상대 기준을, minScore 0 이면 절대 기준을 쓰지 않는다.
 */
export function selectByEmbedding<T>(ranked: { item: T; score: number }[], rule: { topK: number; minScore: number; margin: number }): { item: T; score: number }[] {
  const best = ranked[0]?.score ?? 0;
  return ranked.filter((entry) => entry.score >= rule.minScore && entry.score >= best - rule.margin).slice(0, rule.topK);
}

/**
 * LLM 이 답한 글에서 id 배열을 읽는다. 글 안의 마지막 `[...]` 를 배열로 본다(앞의 것은 예시나 생각 과정일 수 있다).
 * 배열이 없으면 null(해석 실패), 빈 배열이면 [](「없음」). 후보에 없는 id 와 중복은 버리고 topK 개까지 돌려준다.
 */
export function parseIdArray(text: string, validIds: number[], topK: number): number[] | null {
  const arrays = text.replace(/<think>[\s\S]*?<\/think>/g, "").match(/\[[^\[\]]*\]/g);
  if (arrays === null) return null;
  const numbers = (arrays[arrays.length - 1].match(/\d+/g) ?? []).map(Number);
  return [...new Set(numbers.filter((value) => validIds.includes(value)))].slice(0, topK);
}
