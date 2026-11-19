import type { Worker } from "node:worker_threads";
import { reasonOf } from "../../collect/abort/index.js";
import { readWorkerSettings } from "../config/index.js";
import { workerUrl } from "../location/index.js";
import { onShutdown, registerTask, type TaskHandle } from "../pool/index.js";
import { busy, startThread, stopThread } from "../thread/index.js";
import type { BuildJob, BuildOutcome, BuildReply } from "./protocol.js";

export type { BuildJob, BuildOutcome } from "./protocol.js";

export type BuildPriority = "foreground" | "background";
export type BuildCallOptions = {
  /** 이 작업 자신의 신호(요청 신호가 아니다): 취소되면 스레드를 끝내고 종료 확인 뒤 취소 오류로 거절한다. */
  signal?: AbortSignal;
  /** foreground = 질의 경로의 cold 빌드, background = 갱신 · 예열. 빈 슬롯은 foreground 가 먼저 가져간다. */
  priority?: BuildPriority;
  owner?: string;
  /** 작업 시한(ms). 넘으면 스레드를 끝내고 종료 확인 뒤 거절한다. */
  timeoutMs: number;
};
export type BuildPool = {
  run(job: BuildJob, options: BuildCallOptions): Promise<BuildOutcome>;
  /** 대기 중인 background 작업을 foreground 로 올린다(질의가 갱신 작업을 기다리게 된 경우). 이미 실행 중이거나 없으면 false. */
  promote(jobId: string): boolean;
  stats(): { running: number; queuedForeground: number; queuedBackground: number; max: number; killed: number };
  close(): Promise<void>;
};

type Entry = {
  job: BuildJob;
  options: BuildCallOptions;
  handle: TaskHandle;
  detach: () => void;
  settled: boolean;
  resolve: (outcome: BuildOutcome) => void;
  reject: (error: Error) => void;
};

/**
 * `cpu.build`: 작업 단위 스레드 풀. 동시에 최대 `DUALCONTEXT_CPU_WORKERS`(기본 min(2, cpus-1), 최소 1)개의 스레드가 돈다.
 * 대기열은 두 단계다: foreground(질의 경로의 cold 빌드)가 background(갱신)보다 먼저 슬롯을 가져간다(같은 단계 안은 FIFO).
 * 취소 · 시한은 스레드를 `terminate` 하고 종료를 확인한 뒤에야 작업을 거절하므로, 거절을 본 쪽은 스레드가 더는 파일을 쓰지 않는다고 믿고
 * 임시 경로를 지울 수 있다. 스레드가 죽으면 그 작업만 실패하고 풀은 그대로 다음 작업을 받는다.
 */
export function createBuildPool(options: { max?: number; heapMb?: number; url?: URL } = {}): BuildPool {
  const settings = readWorkerSettings();
  const max = options.max ?? settings.cpuWorkers;
  const heapMb = options.heapMb ?? settings.buildHeapMb;
  const url = options.url ?? workerUrl("build");
  const foreground: Entry[] = [];
  const background: Entry[] = [];
  const active = new Set<{ stop: (error: Error) => Promise<void> }>();
  let killed = 0;
  let closed = false;
  let unregister: () => void = () => undefined;

  function pump() {
    while (!closed && active.size < max) {
      const entry = foreground.shift() ?? background.shift();
      if (entry === undefined) return;
      start(entry);
    }
  }

  function start(entry: Entry) {
    entry.handle.start();
    const worker: Worker = startThread(url, { workerData: entry.job, resourceLimits: { maxOldGenerationSizeMb: heapMb } });
    busy(worker);
    let finished: Promise<void> | undefined;
    const timer = setTimeout(() => void finalize(new Error("index time limit exceeded"), true), entry.options.timeoutMs);
    const { signal } = entry.options;
    const onAbort = () => void finalize(signal !== undefined ? reasonOf(signal) : new Error("build cancelled"), true);
    signal?.addEventListener("abort", onAbort, { once: true });
    const handle = {
      stop: (error: Error) => finalize(error, true)
    };
    active.add(handle);

    /** 결과를 정착시킨다. 스레드를 끝내고 종료를 확인한 뒤 약속을 풀고 슬롯을 돌려준다(여러 번 불려도 한 번만). */
    function finalize(result: BuildOutcome | Error, kill: boolean): Promise<void> {
      finished ??= (async () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (kill && result instanceof Error) killed += 1;
        await stopThread(worker);
        active.delete(handle);
        if (!entry.settled) {
          entry.settled = true;
          entry.detach();
          entry.handle.end();
          if (result instanceof Error) entry.reject(result);
          else entry.resolve(result);
        }
        pump();
      })();
      return finished;
    }

    worker.on("message", (reply: BuildReply) => {
      if (reply.type === "done") void finalize({ builtAt: reply.builtAt, stats: reply.stats }, false);
      else void finalize(new Error(reply.message), false);
    });
    worker.on("error", (error: Error) => void finalize(error, false));
    worker.on("exit", (code) => void finalize(new Error(`build worker exited with code ${code}`), false));
  }

  const pool: BuildPool = {
    run(job, callOptions) {
      return new Promise<BuildOutcome>((resolve, reject) => {
        if (closed) return reject(new Error("build pool is closed"));
        const { signal } = callOptions;
        if (signal?.aborted) return reject(reasonOf(signal));
        const queue = callOptions.priority === "background" ? background : foreground;
        const entry: Entry = { job, options: callOptions, handle: registerTask(job.jobId, "build", "terminate", callOptions.owner), detach: () => undefined, settled: false, resolve, reject };
        if (signal !== undefined) {
          const onAbort = () => {
            // 대기 중 background 에서 foreground 로 올라갔을 수 있으므로 두 대기열을 모두 본다.
            const holder = [foreground, background].find((candidate) => candidate.includes(entry));
            if (holder === undefined) return;
            holder.splice(holder.indexOf(entry), 1);
            entry.settled = true;
            entry.handle.end();
            reject(reasonOf(signal));
          };
          signal.addEventListener("abort", onAbort, { once: true });
          entry.detach = () => signal.removeEventListener("abort", onAbort);
        }
        queue.push(entry);
        pump();
      });
    },
    promote(jobId) {
      const at = background.findIndex((entry) => entry.job.jobId === jobId);
      if (at < 0) return false;
      foreground.push(...background.splice(at, 1));
      pump();
      return true;
    },
    stats: () => ({ running: active.size, queuedForeground: foreground.length, queuedBackground: background.length, max, killed }),
    async close() {
      closed = true;
      unregister();
      const error = new Error("build pool is closed");
      for (const entry of [...foreground.splice(0), ...background.splice(0)]) {
        entry.settled = true;
        entry.detach();
        entry.handle.end();
        entry.reject(error);
      }
      await Promise.all([...active].map((handle) => handle.stop(error)));
    }
  };
  unregister = onShutdown(() => pool.close());
  return pool;
}

let shared: BuildPool | undefined;

/** 프로세스 공용 풀. */
export function buildPool(): BuildPool {
  shared ??= createBuildPool();
  return shared;
}
