/** 실행을 끝낸 사유. cancelled = 사용자 · 클라이언트 이탈, deadline = 선택 시한 만료, shutdown = 서버 종료. */
export type AbortReason = "cancelled" | "deadline" | "shutdown";

/**
 * 실행이 취소되었다는 오류. 일반 실패와 **다른 타입**이다: 조사원 실패 흡수 · 키워드 폴백 · dedupe 폴백 같은 fallback 경계는
 * 이 오류를 삼키지 않고 다시 던진다(취소 뒤에 후속 호출이 생기지 않게 한다).
 */
export class RunAborted extends Error {
  readonly name = "RunAborted";
  constructor(readonly reason: AbortReason, message?: string) {
    super(message ?? `run aborted (${reason})`);
  }
}

/** 모듈 경계를 넘어 오는 오류도 이름으로 알아본다(번들 · 복제로 instanceof 가 깨지는 경우 대비). */
export const isRunAborted = (error: unknown): error is RunAborted =>
  error instanceof RunAborted || (error instanceof Error && error.name === "RunAborted");

/** signal 이 이미 abort 되었으면 RunAborted 를 던진다(경계에서 확인하는 용도). */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (isRunAborted(reason)) throw reason;
  throw new RunAborted("cancelled");
}
