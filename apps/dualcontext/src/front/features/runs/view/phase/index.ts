import type { RunDetail } from "../../../../lib/run";

export type RunPhase = {
  running: boolean;
  /** 증강 단계(라우팅 · 수집 · 컨텍스트)가 끝났는가. 조사원이 하나도 선택되지 않아 쌍이 0개여도 끝난 것이다. */
  augmentDone: boolean;
};

export function runPhase(run: Pick<RunDetail, "status" | "stage">): RunPhase {
  return { running: run.status === "running", augmentDone: run.stage === "answering" || run.stage === "done" };
}
