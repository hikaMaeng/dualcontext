import { PAGE_SIZE, type ListQuery } from "../query";

/**
 * 목록 조건을 `/runs?...` 경로로 만든다. 조사원 · 프로시저는 같은 이름의 파라미터를 반복해 싣고,
 * 검색어가 비어 있으면 q · mode 는 보내지 않는다(검색 방식은 검색어가 있을 때만 뜻이 있다).
 */
export function buildListPath(query: ListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(PAGE_SIZE));
  for (const name of query.researchers) params.append("researcher", name);
  for (const name of query.procedures) params.append("procedure", name);
  const q = query.q.trim();
  if (q !== "") {
    params.set("q", q);
    params.set("mode", query.mode);
  }
  return `/runs?${params.toString()}`;
}
