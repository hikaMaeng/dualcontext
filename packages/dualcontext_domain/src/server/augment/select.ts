import type { Researcher, RoutingScore } from "../../common/index.js";
import type { ScoredId, Selection } from "../route/index.js";
import { splitQuery } from "../split/index.js";

/** 질의 분해와 조사원 선택에 필요한 포트(증강 전체와 관리자 라우팅 미리보기가 같이 쓴다). */
export type SelectPorts = {
  /** 질의를 하위 질문으로 나눈다. 없으면 기본 휴리스틱을 쓴다. 나눌 곳이 없으면 질의 하나만 담아 돌려준다. */
  split?: (query: string) => Promise<string[]>;
  /** part 가 true 면 복합 질의의 하위 질문이라 한 분야만 고르면 된다. */
  selectResearchers: (query: string, candidates: Researcher[], options?: { part?: boolean }) => Promise<Selection<Researcher>>;
};

/** 통째 질의나 하위 질문 하나와 그 라우팅 결과. */
export type AskedSelection = { asked: string; selection: Selection<Researcher> };

/** 여러 라우팅 결과의 합집합: 선택은 하나라도 고른 것, 점수는 후보별 최댓값. mode 는 첫 결과(통째 질의)를 따른다. */
export function mergeSelections<T extends { id: number }>(selections: Selection<T>[]): Selection<T> {
  const selected: T[] = [];
  for (const selection of selections) for (const item of selection.selected) if (!selected.some((existing) => existing.id === item.id)) selected.push(item);
  const best = new Map<number, ScoredId>();
  for (const entry of selections.flatMap((selection) => selection.scores ?? [])) {
    const current = best.get(entry.id);
    if (!current || entry.score > current.score) best.set(entry.id, { ...entry });
  }
  for (const entry of best.values()) entry.selected = selected.some((item) => item.id === entry.id);
  return { mode: selections[0].mode, selected, scores: best.size > 0 ? [...best.values()] : undefined };
}

/** 후보 이름과 라우팅 점수를 합쳐 사람이 읽을 수 있는 점수표로 만든다. */
export function trace(candidates: { id: number; name: string }[], scores: ScoredId[] | undefined): RoutingScore[] {
  return (scores ?? []).map((entry) => ({ name: candidates.find((candidate) => candidate.id === entry.id)?.name ?? String(entry.id), score: Number(entry.score.toFixed(4)), selected: entry.selected }));
}

/**
 * 조사원 선택: 질의를 나누고 통째 질의와 하위 질문을 각각 라우팅해 합집합을 만든다.
 * 복합 질의는 통째로 임베딩하면 의미가 섞여 한 분야에 밀리므로 하위 질문으로도 라우팅한다.
 */
export async function selectForQuery(query: string, researchers: Researcher[], ports: SelectPorts) {
  const parts = ports.split ? await ports.split(query) : splitQuery(query);
  const asked: AskedSelection[] = [{ asked: query, selection: await ports.selectResearchers(query, researchers) }];
  if (parts.length > 1) for (const part of parts) asked.push({ asked: part, selection: await ports.selectResearchers(part, researchers, { part: true }) });
  return { parts: parts.length > 1 ? parts : [], asked, merged: mergeSelections(asked.map((entry) => entry.selection)) };
}
