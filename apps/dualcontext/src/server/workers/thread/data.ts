import { workerData } from "node:worker_threads";

/** 스레드 본체가 시작 때 받은 자료. 소스 부트스트랩(`.ts` 실행)이면 감싸서 오므로 풀어 준다. */
export function threadData<T>(): T {
  const raw = workerData as { __entry?: string; __data?: unknown } | null;
  return (raw !== null && typeof raw === "object" && "__entry" in raw ? raw.__data : raw) as T;
}
