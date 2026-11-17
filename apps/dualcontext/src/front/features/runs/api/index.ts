import type { RunNodeDetail } from "dualcontext_domain/common";
import { api } from "../../../lib/api";
import type { ListQuery } from "../query";
import { buildListPath } from "./path";
import type { RunFilterOptions, RunListPage } from "./types";

export const listRuns = (query: ListQuery) => api<RunListPage>(buildListPath(query));
export const loadFilterOptions = () => api<RunFilterOptions>("/runs/filters");
export const deleteRun = (id: number) => api<void>(`/runs/${id}`, { method: "DELETE" });

/**
 * 실행의 노드 상세 한 건. 그 노드의 문서가 없으면(옛 실행 · 아직 안 만들어짐 · 문서를 남기지 않는 노드) 404 이므로 null 이다 —
 * 오류가 아니라 「상세 기록 없음」이라는 정상 결과다. 그 밖의 실패는 던진다.
 */
export async function loadNode(id: number, key: string): Promise<RunNodeDetail | null> {
  try {
    return await api<RunNodeDetail>(`/runs/${id}/nodes/${encodeURIComponent(key)}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("404")) return null;
    throw error;
  }
}
