/** 실행 로그의 해시 경로: `#runs` 는 목록, `#runs/227` 은 실행 227 의 뷰. */
export type RunsRoute = { kind: "list" } | { kind: "view"; id: number };

export const LIST_HASH = "#runs";

export const viewHash = (id: number): string => `#runs/${id}`;

export function parseRunsHash(hash: string): RunsRoute {
  const match = /^#runs\/(\d+)$/.exec(hash);
  return match ? { kind: "view", id: Number(match[1]) } : { kind: "list" };
}
