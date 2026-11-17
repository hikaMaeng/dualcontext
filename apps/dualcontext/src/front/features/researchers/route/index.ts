/** 조사원의 해시 경로: `#researchers` 는 목록, `#researchers/new` 는 새로 만들기, `#researchers/12` 는 조사원 12 의 뷰. */
export type ResearchersRoute = { kind: "list" } | { kind: "new" } | { kind: "view"; id: number };

export const LIST_HASH = "#researchers";
export const NEW_HASH = "#researchers/new";

export const viewHash = (id: number): string => `#researchers/${id}`;

export function parseResearchersHash(hash: string): ResearchersRoute {
  if (hash === NEW_HASH) return { kind: "new" };
  const match = /^#researchers\/(\d+)$/.exec(hash);
  return match ? { kind: "view", id: Number(match[1]) } : { kind: "list" };
}
