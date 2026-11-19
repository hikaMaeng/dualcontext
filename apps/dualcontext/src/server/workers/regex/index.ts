import { randomUUID } from "node:crypto";
import type { Worker } from "node:worker_threads";
import { reasonOf } from "../../collect/abort/index.js";
import { workerUrl } from "../location/index.js";
import { onShutdown, registerTask, type TaskHandle } from "../pool/index.js";
import { busy, idle, startThread, stopThread } from "../thread/index.js";
import { judgeTargets, regexLimits } from "./judge.js";
import type { RegexReply, RegexRequest } from "./protocol.js";

export { judgeTargets, regexLimits } from "./judge.js";

export type RegexFilterOptions = { signal?: AbortSignal; owner?: string };
export type RegexPool = {
  /**
   * 대상(경로 + 쿼리) 각각이 포함 · 제외 패턴을 통과하는지(true = 따라갈 링크). 50개씩 묶음 하나가 작업 하나다.
   * 묶음이 시한(워커가 시작을 알린 뒤 200ms)을 넘기거나 스레드가 죽으면 그 묶음의 대상은 전부 제외(false)로 돌려준다.
   * 신호가 취소되면 스레드를 끝내고 취소 오류로 거절한다(스레드 종료를 확인한 뒤).
   */
  filter(include: string[], exclude: string[], targets: string[], options?: RegexFilterOptions): Promise<boolean[]>;
  /** 계측: 시한 초과로 끝낸 묶음 수 · 스레드가 죽은 횟수 · 스레드를 새로 띄운 횟수. */
  stats(): { timeouts: number; crashes: number; spawns: number; queued: number };
  close(): Promise<void>;
};

type Job = {
  request: RegexRequest;
  handle: TaskHandle;
  settled: boolean;
  settle: (result: boolean[] | Error) => void;
  signal: AbortSignal | undefined;
  detach: () => void;
};

/** 작업이 `started` 를 알리기까지 기다리는 한도(스레드 기동 · 모듈 로딩 포함). 넘으면 스레드가 죽은 것으로 보고 새로 띄운다. */
const startGraceMs = 15_000;

/**
 * `cpu.regex`: 임의 정규식(관리자가 쓴 include/exclude)을 도는 전용 스레드 한 개. 정규식은 시간이 보장되지 않으므로 종료 가능한 스레드에서만 돈다.
 * 키 없음(전용 하나). 작업은 FIFO 로 하나씩 실행하고, 시한 초과 · 취소 · 스레드 이상 종료 때 스레드를 끝내고 다음 작업에 새로 띄운다.
 */
export function createRegexPool(options: { url?: URL; timeoutMs?: number } = {}): RegexPool {
  const url = options.url ?? workerUrl("regex");
  const timeoutMs = options.timeoutMs ?? regexLimits.timeoutMs;
  let worker: Worker | null = null;
  let current: Job | null = null;
  let closed = false;
  let unregister: () => void = () => undefined;
  let timer: NodeJS.Timeout | undefined;
  const queue: Job[] = [];
  const counters = { timeouts: 0, crashes: 0, spawns: 0 };
  const falses = (job: Job) => job.request.targets.map(() => false);

  const spawn = (): Worker => {
    const thread = startThread(url);
    counters.spawns += 1;
    thread.on("message", (reply: RegexReply) => onReply(thread, reply));
    thread.on("error", () => void onDeath(thread, "error"));
    thread.on("exit", () => void onDeath(thread, "exit"));
    return thread;
  };

  const finish = (job: Job, result: boolean[] | Error) => {
    if (job.settled) return;
    job.settled = true;
    clearTimeout(timer);
    job.detach();
    job.handle.end();
    job.settle(result);
  };

  /** 지금 스레드를 끝내고(종료 확인) 그 일을 `result` 로 정착시킨 뒤 다음 작업을 시작한다. */
  const recycle = async (job: Job, result: (job: Job) => boolean[] | Error) => {
    const thread = worker;
    worker = null;
    current = null;
    clearTimeout(timer);
    if (thread !== null) await stopThread(thread);
    finish(job, result(job));
    pump();
  };

  function onReply(thread: Worker, reply: RegexReply) {
    const job = current;
    if (thread !== worker || job === null || reply.id !== job.request.id) return;
    if (reply.type === "started") {
      clearTimeout(timer);
      timer = setTimeout(() => {
        counters.timeouts += 1;
        void recycle(job, falses);
      }, timeoutMs);
      return;
    }
    current = null;
    idle(thread);
    finish(job, reply.type === "done" ? reply.wanted : falses(job));
    pump();
  }

  async function onDeath(thread: Worker, _kind: "error" | "exit") {
    if (thread !== worker) return;
    const job = current;
    worker = null;
    current = null;
    if (job !== null && !closed) {
      counters.crashes += 1;
      finish(job, falses(job));
    }
    pump();
  }

  function pump() {
    if (closed || current !== null) return;
    const job = queue.shift();
    if (job === undefined) return;
    worker ??= spawn();
    current = job;
    busy(worker);
    job.handle.start();
    timer = setTimeout(() => {
      counters.crashes += 1;
      void recycle(job, falses);
    }, startGraceMs);
    worker.postMessage(job.request);
  }

  const submit = (request: RegexRequest, optionsOf: RegexFilterOptions): Promise<boolean[]> =>
    new Promise<boolean[]>((resolve, reject) => {
      if (closed) return reject(new Error("regex pool is closed"));
      const { signal } = optionsOf;
      if (signal?.aborted) return reject(reasonOf(signal));
      const job: Job = {
        request,
        handle: registerTask(request.id, "regex", "terminate", optionsOf.owner),
        settled: false,
        settle: (result) => (result instanceof Error ? reject(result) : resolve(result)),
        signal,
        detach: () => undefined
      };
      if (signal !== undefined) {
        const onAbort = () => {
          const at = queue.indexOf(job);
          if (at >= 0) {
            queue.splice(at, 1);
            finish(job, reasonOf(signal));
          } else if (current === job) void recycle(job, () => reasonOf(signal));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        job.detach = () => signal.removeEventListener("abort", onAbort);
      }
      queue.push(job);
      pump();
    });

  const pool: RegexPool = {
    async filter(include, exclude, targets, filterOptions = {}) {
      if (targets.length === 0) return [];
      const batches: string[][] = [];
      for (let at = 0; at < targets.length; at += regexLimits.batch) batches.push(targets.slice(at, at + regexLimits.batch));
      const results = await Promise.all(batches.map((batch) => submit({ id: randomUUID(), include, exclude, targets: batch }, filterOptions)));
      return results.flat();
    },
    stats: () => ({ ...counters, queued: queue.length }),
    async close() {
      closed = true;
      unregister();
      clearTimeout(timer);
      const error = new Error("regex pool is closed");
      for (const job of queue.splice(0)) finish(job, error);
      if (current !== null) finish(current, error);
      current = null;
      const thread = worker;
      worker = null;
      if (thread !== null) await stopThread(thread);
    }
  };
  unregister = onShutdown(() => pool.close());
  return pool;
}

let shared: RegexPool | undefined;

/** 프로세스 공용 풀(첫 사용 때 스레드를 띄운다). */
export function regexPool(): RegexPool {
  shared ??= createRegexPool();
  return shared;
}
