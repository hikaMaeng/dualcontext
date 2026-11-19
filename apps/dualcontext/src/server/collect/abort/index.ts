/**
 * 수집기의 취소 규약. 실행 취소 신호(`AbortSignal`)는 선택 인자로 내려오고, 취소는 `RunAborted` 계열 오류로 표현된다.
 * `RunAborted` 클래스는 도메인 공통 패키지가 소유하므로(수집기는 그 패키지의 클래스에 묶이지 않는다) 여기서는 이름으로만 판정한다.
 */

/** 취소로 끝난 오류인가: `RunAborted`(실행 취소 · 시한 · 종료) 또는 `AbortError`(fetch · timers · `signal.throwIfAborted()`). */
export function isAbort(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === "RunAborted" || name === "AbortError";
}

/** 취소 사유를 오류로 돌려준다: 실행 컨텍스트가 `RunAborted` 를 사유로 달았으면 그것, 아니면 `AbortError`. */
export function reasonOf(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

/** 신호가 이미 취소됐으면 그 사유(`RunAborted` 면 그것)를, 사유가 오류가 아니면 `AbortError` 를 던진다. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw reasonOf(signal);
}

/**
 * 취소할 수 없는 대기(DB 쿼리 · 공유 작업의 약속)를 신호와 경주시킨다. 신호가 먼저 오면 이 분기는 즉시 취소 오류로 끝나고,
 * 원래 약속은 고아로 남는다(짧게 끝나는 쿼리이거나 다른 요청도 기다리는 공유 작업이라 죽이지 않는다). 원래 약속의 뒤늦은 실패는 삼킨다.
 * 신호가 없으면 약속을 그대로 돌려준다.
 */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(reasonOf(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      promise.catch(() => undefined);
      reject(reasonOf(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}
