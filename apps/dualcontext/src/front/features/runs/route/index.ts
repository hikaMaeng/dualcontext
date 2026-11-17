/**
 * 실행 로그의 해시 경로: `#runs` 는 목록, `#runs/227` 은 실행 227 의 뷰(그래프 + 노드 상세),
 * `#runs/227/node/item%3Ai3` 는 그 실행의 노드 하나(키 `item:i3`)만 전체 화면으로 보는 화면(새 창으로 열기가 쓴다).
 */
export type RunsRoute = { kind: "list" } | { kind: "view"; id: number } | { kind: "node"; id: number; key: string };

export const LIST_HASH = "#runs";

export const viewHash = (id: number): string => `#runs/${id}`;

/** 노드 키(`item:i3`)는 `:` 를 가지므로 주소에서는 인코딩한다. */
export const nodeHash = (id: number, key: string): string => `#runs/${id}/node/${encodeURIComponent(key)}`;

export function parseRunsHash(hash: string): RunsRoute {
  const node = /^#runs\/(\d+)\/node\/([^/]+)$/.exec(hash);
  if (node) {
    try {
      const key = decodeURIComponent(node[2]);
      return key === "" ? { kind: "view", id: Number(node[1]) } : { kind: "node", id: Number(node[1]), key };
    } catch {
      // 깨진 퍼센트 인코딩: 노드를 알 수 없으니 실행 뷰로 보낸다.
      return { kind: "view", id: Number(node[1]) };
    }
  }
  const match = /^#runs\/(\d+)$/.exec(hash);
  return match ? { kind: "view", id: Number(match[1]) } : { kind: "list" };
}
