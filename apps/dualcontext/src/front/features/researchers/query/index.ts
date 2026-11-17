import type { Researcher, ResearcherType } from "dualcontext_domain/common";
import { summarizeSource } from "../summary";

/**
 * 조사원 목록의 조회 조건. 목록 전체를 한 번에 읽어 오므로 걸러내기 · 정렬 · 쪽 나누기는 화면에서 한다(조사원은 수백 개 이하).
 * 순수 값이라 React 밖에서 만들고 시험한다.
 */
export const PAGE_SIZE = 20;

export type EnabledFilter = "" | "on" | "off";
/** "" 전체, "none" 연결된 프로시저 없음, 그 밖에는 프로시저 id(문자열). */
export type ProcedureFilter = string;
export type DefaultFilter = "" | "has" | "none";
export type RouterFilter = "" | "own" | "global";
export type SortKey = "id" | "name";

export type ResearcherQuery = {
  page: number;
  /** 공백으로 나눈 낱말이 모두(AND) 이름 · 설명 · 키워드 · 출처에 들어 있어야 한다. 대소문자 무시. */
  q: string;
  type: "" | ResearcherType;
  enabled: EnabledFilter;
  procedure: ProcedureFilter;
  defaultProcedure: DefaultFilter;
  router: RouterFilter;
  sort: SortKey;
};

export const initialQuery: ResearcherQuery = { page: 1, q: "", type: "", enabled: "", procedure: "", defaultProcedure: "", router: "", sort: "id" };

/** 조건을 바꾸면 항상 1쪽으로 돌아간다. */
export function changeFilter(query: ResearcherQuery, patch: Partial<Omit<ResearcherQuery, "page">>): ResearcherQuery {
  return { ...query, ...patch, page: 1 };
}

/** 걸러내기 조건이 하나라도 걸려 있는가(정렬은 조건이 아니다). */
export function isFiltering(query: ResearcherQuery): boolean {
  return query.q.trim() !== "" || query.type !== "" || query.enabled !== "" || query.procedure !== "" || query.defaultProcedure !== "" || query.router !== "";
}

const haystack = (item: Researcher): string => {
  const source = summarizeSource(item);
  return [item.name, item.description, ...item.keywords, source.value].join("\n").toLowerCase();
};

/** 조건에 맞는 조사원(정렬 적용). 입력 배열은 바꾸지 않는다. */
export function filterResearchers(items: Researcher[], query: ResearcherQuery): Researcher[] {
  const terms = query.q.toLowerCase().split(/\s+/).filter((term) => term !== "");
  const kept = items.filter((item) => {
    if (query.type !== "" && item.type !== query.type) return false;
    if (query.enabled === "on" && !item.enabled) return false;
    if (query.enabled === "off" && item.enabled) return false;
    if (query.procedure === "none" && item.procedureIds.length > 0) return false;
    if (query.procedure !== "" && query.procedure !== "none" && !item.procedureIds.includes(Number(query.procedure))) return false;
    if (query.defaultProcedure === "has" && item.defaultProcedureId == null) return false;
    if (query.defaultProcedure === "none" && item.defaultProcedureId != null) return false;
    if (query.router === "own" && !item.router) return false;
    if (query.router === "global" && item.router) return false;
    if (terms.length === 0) return true;
    const text = haystack(item);
    return terms.every((term) => text.includes(term));
  });
  return query.sort === "name" ? [...kept].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id) : [...kept].sort((a, b) => a.id - b.id);
}

export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** 범위를 벗어난 쪽(걸러서 쪽이 줄어든 경우 등)을 가까운 유효한 쪽으로 맞춘다. */
export function clampPage(page: number, total: number, pageSize: number = PAGE_SIZE): number {
  return Math.min(Math.max(1, page), pageCount(total, pageSize));
}

/** page(1부터)쪽 항목. 범위를 벗어난 쪽은 가까운 쪽으로 맞춘다. */
export function pageOf<T>(items: T[], page: number, pageSize: number = PAGE_SIZE): T[] {
  const at = clampPage(page, items.length, pageSize);
  return items.slice((at - 1) * pageSize, at * pageSize);
}
