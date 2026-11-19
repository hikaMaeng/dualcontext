/** 한 실행이 폴더 조사원들로 읽을 수 있는 총 바이트(기본 20MB). 환경 변수 `DUALCONTEXT_FOLDER_RUN_MB` 로 바꾼다. */
export function defaultRunBudgetBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.DUALCONTEXT_FOLDER_RUN_MB);
  return Number.isInteger(raw) && raw >= 1 && raw <= 4096 ? raw * 1024 * 1024 : 20 * 1024 * 1024;
}

export type ByteBudget = { remaining: number };

/**
 * 실행 단위 예산: 키 = 그 실행의 취소 신호(실행마다 하나이므로 한 실행의 모든 폴더 조사원이 같은 예산을 나눠 쓴다),
 * 범위 = 신호가 살아 있는 동안(`WeakMap` 이라 실행이 끝나 신호가 사라지면 함께 사라진다). 신호가 없는 호출은 호출마다 새 예산이다.
 */
const budgets = new WeakMap<AbortSignal, ByteBudget>();

export function budgetFor(signal: AbortSignal | undefined, total: number = defaultRunBudgetBytes()): ByteBudget {
  if (signal === undefined) return { remaining: total };
  let budget = budgets.get(signal);
  if (budget === undefined) {
    budget = { remaining: total };
    budgets.set(signal, budget);
  }
  return budget;
}
