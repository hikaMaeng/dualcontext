import { createTaskQueue, type Priority, type QueueStats, type TaskQueue } from "../../queue/index.js";
import { collectKinds, defaultCollectWorkers, type CollectKind } from "./config.js";

export { collectKinds, defaultCollectWorkers, type CollectKind } from "./config.js";

export type CollectRunOptions = {
  /** 공정성 단위(실행). 같은 큐에서 실행들이 번갈아 당겨진다. */
  runKey?: string;
  /** 취소되면 큐에서 빠지거나 실행 중이면 작업의 신호가 abort 된다. 작업은 RunAborted 로 reject 된다. */
  signal?: AbortSignal;
  priority?: Priority;
};

type Job = { work: (signal: AbortSignal) => Promise<unknown> };

/**
 * 조사원 수집의 작업 큐 묶음(종류별 큐 하나씩). 모델 큐와 같은 `createTaskQueue` 이므로 모든 요청을 받고(길이 상한 · 거절 없음),
 * 부하의 상한은 종류별 소비자 수다. 재시도는 하지 않는다(수집기 오류는 그대로 조사원의 실패가 된다).
 *
 * 의존 방향: 수집 작업은 모델 큐(chat · embed)를 기다릴 수 있지만 모델 큐는 수집 큐를 기다리지 않는다. 그래서 순환 대기가 없다.
 * 웹 검색만은 모델 호출(검색어 재작성)을 큐 밖에서 끝내고 외부 요청 하나만 큐에 넣는다(소비자를 쥔 채 모델을 기다리지 않는다).
 * 설계: docs/execution-design.md 「조사원 수집 큐」.
 */
export function createCollectQueues(workers: Record<CollectKind, number> = defaultCollectWorkers()) {
  const queues = Object.fromEntries(
    collectKinds.map((kind) => [kind, createTaskQueue<Job, unknown>({ workers: workers[kind], attempt: (job, { signal }) => job.work(signal) })])
  ) as Record<CollectKind, TaskQueue<Job, unknown>>;

  return {
    /** 작업을 종류의 큐에 담고 결과를 받는다. work 가 받는 신호는 취소되면 abort 된다. */
    run<T>(kind: CollectKind, work: (signal: AbortSignal) => Promise<T>, options: CollectRunOptions = {}): Promise<T> {
      return queues[kind].submit(
        { work },
        {
          ...(options.runKey !== undefined ? { runKey: options.runKey } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
          ...(options.priority ? { priority: options.priority } : {})
        }
      ) as Promise<T>;
    },
    stats(): Record<CollectKind, QueueStats> {
      return Object.fromEntries(collectKinds.map((kind) => [kind, queues[kind].stats()])) as Record<CollectKind, QueueStats>;
    },
    async close(): Promise<void> {
      await Promise.all(collectKinds.map((kind) => queues[kind].close()));
    }
  };
}

export type CollectQueues = ReturnType<typeof createCollectQueues>;
