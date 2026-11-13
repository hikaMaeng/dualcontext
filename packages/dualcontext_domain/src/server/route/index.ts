import type { Procedure, Researcher } from "../../common/index.js";

function score(query: string, keywords: string[]): number {
  const lowered = query.toLowerCase();
  return keywords.filter((keyword) => keyword.trim() !== "" && lowered.includes(keyword.trim().toLowerCase())).length;
}

/**
 * 질의에서 연구원을 고른다. 키워드가 하나라도 맞는 연구원만 남기고,
 * 맞는 것이 없으면 사용 가능한 전체로 되돌아간다(fallback-all).
 */
export function routeResearchers(query: string, researchers: Researcher[]) {
  const enabled = researchers.filter((researcher) => researcher.enabled);
  const matched = enabled
    .map((researcher) => ({ researcher, score: score(query, researcher.keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.researcher);

  if (matched.length > 0) return { mode: "matched" as const, selected: matched };
  if (enabled.length > 0) return { mode: "fallback-all" as const, selected: enabled };
  return { mode: "none" as const, selected: [] };
}

/**
 * (질의, 연구원)에 맞는 프로시저를 고른다. appliesWhen 이 비어 있는 프로시저는 항상 후보다.
 * 키워드가 맞은 프로시저가 있으면 그것들만, 없으면 항상 적용 프로시저만 남긴다.
 */
export function routeProcedures(query: string, procedures: Procedure[]): Procedure[] {
  const enabled = procedures.filter((procedure) => procedure.enabled);
  const matched = enabled.filter((procedure) => procedure.appliesWhen.length > 0 && score(query, procedure.appliesWhen) > 0);
  return matched.length > 0 ? matched : enabled.filter((procedure) => procedure.appliesWhen.length === 0);
}
