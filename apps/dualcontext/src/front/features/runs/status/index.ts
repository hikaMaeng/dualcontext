import type { Texts } from "../../../i18n";
import type { RunStatus } from "../../../lib/run";
import { RSC } from "../resource";

/** 실행 상태(진행중 · 성공 · 실패)의 화면 문구. 목록 항목과 뷰 요약이 같이 쓴다. */
export function statusText(status: RunStatus, t: Texts): string {
  return status === "running" ? t[RSC.RUNS_RUNNING_STATUS] : status === "ok" ? t[RSC.RUNS_OK_STATUS] : t[RSC.RUNS_FAILED_ALERT];
}
