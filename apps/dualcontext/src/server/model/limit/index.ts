/** 동시에 실행되는 작업 수를 제한한다. 한 AI 서버를 여러 실행이 나눠 쓸 때 용량 초과(503)를 줄인다. */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

export type RetryOptions = { attempts: number; baseMs: number; sleep?: (ms: number) => Promise<void> };

/** 서버가 용량 부족(503)·요청 과다(429)로 답한 호출만 지수 백오프로 다시 시도한다. 다른 오류는 바로 던진다. */
export async function retryOverloaded<T>(task: () => Promise<T>, { attempts, baseMs, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }: RetryOptions): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      const status = (error as { status?: number }).status;
      if ((status !== 503 && status !== 429) || attempt >= attempts) throw error;
      await sleep(baseMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5));
    }
  }
}
