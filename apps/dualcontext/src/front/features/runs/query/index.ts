/** 실행 로그 목록의 조회 조건. 순수 값이라 React 밖에서 만들고 시험한다. */
export type SearchMode = "keyword" | "semantic";

export const PAGE_SIZE = 20;

export type ListQuery = {
  page: number;
  /** 조사원 · 프로시저 필터는 서로 OR 이고, 검색어(q)와는 AND 다(서버 계약). */
  researchers: string[];
  procedures: string[];
  q: string;
  mode: SearchMode;
};

export const initialQuery: ListQuery = { page: 1, researchers: [], procedures: [], q: "", mode: "keyword" };

/** 이미 있으면 그대로 두고, 없으면 끝에 붙인다. */
export function addName(names: string[], name: string): string[] {
  return names.includes(name) ? names : [...names, name];
}

export function removeName(names: string[], name: string): string[] {
  return names.filter((entry) => entry !== name);
}

/** 필터 · 검색을 바꾸면 항상 1쪽으로 돌아간다. */
export function changeFilter(query: ListQuery, patch: Partial<Omit<ListQuery, "page">>): ListQuery {
  return { ...query, ...patch, page: 1 };
}

export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** 범위를 벗어난 쪽(마지막 항목을 지워 쪽이 줄어든 경우 등)을 가까운 유효한 쪽으로 맞춘다. */
export function clampPage(page: number, total: number, pageSize: number = PAGE_SIZE): number {
  return Math.min(Math.max(1, page), pageCount(total, pageSize));
}
