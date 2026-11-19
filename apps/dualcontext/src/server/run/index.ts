import { RunAborted, type AbortReason } from "dualcontext_domain/common";

/**
 * 실행 하나의 취소 컨텍스트. 신호(signal) 하나와 종료 사유를 가진다. 사유는 한 번만 정해진다(처음 abort 한 쪽이 이긴다).
 * 모든 모델 호출은 이 신호를 달고 큐에 담기고(`model.forRun`), 플래너는 경계마다 확인한다.
 * 선택 시한(budgetMs)이 있으면 타이머가 `deadline` 으로 abort 한다. 기본은 시한 없음.
 */
export type RunContext = {
  readonly runId: number;
  readonly signal: AbortSignal;
  /** abort 되었으면 그 사유, 아니면 null. */
  reason(): AbortReason | null;
  cancel(reason: AbortReason): void;
  /** 타이머 · 레지스트리 항목을 정리한다(실행이 끝났을 때). */
  dispose(): void;
};

/** 활성 실행 레지스트리. 키: runId. 범위: 프로세스. 수명: 실행 하나(dispose 가 지운다). 상한: 동시에 도는 실행 수(제한 없음). */
const active = new Map<number, RunContext>();

export function createRunContext(runId: number, options: { budgetMs?: number } = {}): RunContext {
  const controller = new AbortController();
  let reason: AbortReason | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const context: RunContext = {
    runId,
    signal: controller.signal,
    reason: () => reason,
    cancel(why) {
      if (reason !== null) return;
      reason = why;
      controller.abort(new RunAborted(why));
    },
    dispose() {
      clearTimeout(timer);
      if (active.get(runId) === context) active.delete(runId);
    }
  };
  if (options.budgetMs !== undefined && options.budgetMs > 0) {
    timer = setTimeout(() => context.cancel("deadline"), options.budgetMs);
    timer.unref();
  }
  active.set(runId, context);
  return context;
}

export const runRegistry = {
  get: (runId: number): RunContext | undefined => active.get(runId),
  /** 실행을 취소한다. 없으면 false. */
  cancel(runId: number, reason: AbortReason): boolean {
    const context = active.get(runId);
    if (!context) return false;
    context.cancel(reason);
    return true;
  },
  cancelAll(reason: AbortReason): number {
    const all = [...active.values()];
    for (const context of all) context.cancel(reason);
    return all.length;
  },
  size: (): number => active.size
};

/**
 * effort(또는 시험 실행의 출처)에 대한 선택 시한(ms). 환경 변수 `DUALCONTEXT_BUDGET_<EFFORT>_S`(초)가 있을 때만 켠다.
 * 기본은 없음: 측정하지 않은 값으로 정상 실행을 자르지 않는다.
 */
export function budgetMs(effort: string | undefined, env: Record<string, string | undefined> = process.env): number | undefined {
  if (!effort) return undefined;
  const seconds = Number(env[`DUALCONTEXT_BUDGET_${effort.toUpperCase()}_S`]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined;
}
