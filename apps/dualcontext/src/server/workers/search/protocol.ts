import type { Material } from "dualcontext_domain/common";

/** 검색 요청. `cancel` 은 메인과 스레드가 공유하는 `Int32Array(1)` 의 버퍼이고, 메인이 0 이 아닌 값을 쓰면 스레드가 협력적으로 멈춘다. */
export type SearchRequest = { id: string; cancel: SharedArrayBuffer; file: string; cacheKey: string; query: string; topK: number };

export type SearchStats = {
  /** 캐시한 검색기를 그대로 썼는가(false 면 읽고 파싱하고 구축했다). */
  warm: boolean;
  readMs: number;
  buildMs: number;
  searchMs: number;
  fileBytes: number;
};

export type SearchReply =
  /** 메인에는 topK 자료와 점수만 돌려준다(색인 전체를 복제하지 않는다). */
  | { id: string; type: "found"; builtAt: string; materials: Material[]; scores: number[]; stats: SearchStats }
  /** 색인이 없거나(`missing`) 64MB 를 넘거나(`too-large`) 형식이 틀렸다(`invalid`): 호출자가 다시 만든다. */
  | { id: string; type: "absent"; reason: "missing" | "too-large" | "invalid" }
  | { id: string; type: "cancelled" }
  | { id: string; type: "failed"; message: string };

export type SearchOutcome = Extract<SearchReply, { type: "found" | "absent" }>;

/** 스레드가 시작 때 받는 설정. */
export type SearchThreadData = { budgetBytes: number };
