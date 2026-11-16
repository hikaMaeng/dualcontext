import type { RunStatus } from "../../../lib/run";

/**
 * 목록 API(`GET /api/admin/runs`)의 계약. 서버 도메인 패키지의 `RunListItem` · `RunListPage` · `RunFilterOptions` 와
 * 같은 모양이며, 도메인 패키지가 합쳐지면 이 파일은 그쪽 타입을 다시 내보내는 것으로 바꾼다.
 */
export type RunListItem = {
  id: number;
  createdAt: string;
  /** 전체 질의(잘라내지 않는다). 목록에서는 한 줄 엘립시스로만 줄여 보인다. */
  query: string;
  status: RunStatus;
  durationMs: number;
  researchers: string[];
  procedures: string[];
  /** 의미 검색일 때 서버가 붙이는 일치 정보. 화면은 읽지 않는다. */
  match?: unknown;
};

export type RunListPage = { items: RunListItem[]; total: number; page: number; pageSize: number };

export type RunFilterOptions = { researchers: string[]; procedures: string[] };
