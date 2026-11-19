import { randomUUID } from "node:crypto";
import type { Worker } from "node:worker_threads";
import { reasonOf } from "../../collect/abort/index.js";
import { readWorkerSettings } from "../config/index.js";
import { workerUrl } from "../location/index.js";
import { onShutdown, registerTask, type TaskHandle } from "../pool/index.js";
import { busy, idle, startThread, stopThread } from "../thread/index.js";
import type { SearchOutcome, SearchReply, SearchRequest, SearchThreadData } from "./protocol.js";

export type { SearchOutcome, SearchStats } from "./protocol.js";

export type IndexQuery = { file: string; cacheKey: string; query: string; topK: number };
export type SearchCallOptions = { signal?: AbortSignal; owner?: string };

export type SearchPool = {
  /**
   * 색인 하나에서 질의한다. 같은 `cacheKey` 는 항상 같은 스레드가 받는다(검색기 캐시가 스레드마다 중복되지 않는다).
   * 신호가 취소되면 대기 중이면 큐에서 빠지고, 실행 중이면 공유 플래그로 스레드가 멈추게 한 뒤(스레드를 죽이지 않는다) 취소 오류로 끝난다.
   * 스레드가 취소에 응답하지 않으면(`cancelGraceMs`) 스레드를 끝내고 다음 작업에 새로 띄운다.
   */
  search(query: IndexQuery, options?: SearchCallOptions): Promise<SearchOutcome>;
  stats(): { workers: number; restarts: number; queued: number; running: number; cancelled: number };
  close(): Promise<void>;
};

export type SearchPoolOptions = { workers?: number; heapMb?: number; cacheBytes?: number; cancelGraceMs?: number; url?: URL };

type Pending = {
  request: SearchRequest;
  flag: Int32Array;
  handle: TaskHandle;
  settled: boolean;
  cancelRequested: boolean;
  signal: AbortSignal | undefined;
  detach: () => void;
  succeed: (outcome: SearchOutcome) => void;
  fail: (error: Error) => void;
};

type Slot = { worker: Worker | null; current: Pending | null; queue: Pending[]; graceTimer: NodeJS.Timeout | undefined };

/** 색인 키 → 스레드 번호. 같은 키는 같은 스레드(FNV-1a). */
export function slotOf(key: string, slots: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193) >>> 0;
  return hash % slots;
}

/**
 * `cpu.search`: 색인 읽기 · 파싱 · 검색기 구축 · 검색을 스레드 안에서 한다. 메인은 `stat` 외에 색인을 만지지 않는다.
 * 스레드 수는 설정(`DUALCONTEXT_SEARCH_WORKERS`, 기본 2), 스레드마다 힙 상한(`maxOldGenerationSizeMb` 기본 768)과 캐시 예산(총합 512MB 를 스레드 수로 나눔).
 * 스레드가 OOM 이나 오류로 죽으면 실행 중이던 작업만 실패하고 같은 슬롯의 대기 작업은 새 스레드가 이어서 처리한다.
 * 스레드마다 한 번에 한 작업(FIFO)이라 취소를 큐에서 바로 처리할 수 있다.
 */
export function createSearchPool(options: SearchPoolOptions = {}): SearchPool {
  const settings = readWorkerSettings();
  const count = options.workers ?? settings.searchWorkers;
  const heapMb = options.heapMb ?? settings.searchHeapMb;
  const budgetBytes = Math.floor((options.cacheBytes ?? settings.searchCacheMb * 1024 * 1024) / count);
  const cancelGraceMs = options.cancelGraceMs ?? 5000;
  const url = options.url ?? workerUrl("search");
  const slots: Slot[] = Array.from({ length: count }, () => ({ worker: null, current: null, queue: [], graceTimer: undefined }));
  const counters = { restarts: 0, cancelled: 0 };
  let closed = false;
  let unregister: () => void = () => undefined;

  const finish = (slot: Slot, pending: Pending, run: () => void) => {
    if (pending.settled) return;
    pending.settled = true;
    pending.detach();
    pending.handle.end();
    if (slot.current === pending) {
      slot.current = null;
      clearTimeout(slot.graceTimer);
    }
    run();
  };

  const abortError = (pending: Pending): Error => (pending.signal !== undefined ? reasonOf(pending.signal) : new Error("search cancelled"));

  function spawn(slot: Slot): Worker {
    const data: SearchThreadData = { budgetBytes };
    const thread = startThread(url, { workerData: data, resourceLimits: { maxOldGenerationSizeMb: heapMb } });
    thread.on("message", (reply: SearchReply) => onReply(slot, thread, reply));
    thread.on("error", (error: Error) => onDeath(slot, thread, error.message));
    thread.on("exit", () => onDeath(slot, thread, "worker exited"));
    return thread;
  }

  function onReply(slot: Slot, thread: Worker, reply: SearchReply) {
    const pending = slot.current;
    if (thread !== slot.worker || pending === null || reply.id !== pending.request.id) return;
    idle(thread);
    finish(slot, pending, () => {
      if (pending.cancelRequested || reply.type === "cancelled") {
        counters.cancelled += 1;
        pending.fail(abortError(pending));
      } else if (reply.type === "failed") pending.fail(new Error(reply.message));
      else pending.succeed(reply);
    });
    pump(slot);
  }

  function onDeath(slot: Slot, thread: Worker, message: string) {
    if (thread !== slot.worker) return;
    slot.worker = null;
    const pending = slot.current;
    if (pending !== null && !closed) {
      counters.restarts += 1;
      finish(slot, pending, () => pending.fail(pending.cancelRequested ? abortError(pending) : new Error(`search worker stopped: ${message}`)));
    }
    pump(slot);
  }

  function pump(slot: Slot) {
    if (closed || slot.current !== null) return;
    const pending = slot.queue.shift();
    if (pending === undefined) return;
    slot.worker ??= spawn(slot);
    slot.current = pending;
    busy(slot.worker);
    pending.handle.start();
    slot.worker.postMessage(pending.request);
  }

  const pool: SearchPool = {
    search(query, callOptions = {}) {
      return new Promise<SearchOutcome>((resolve, reject) => {
        if (closed) return reject(new Error("search pool is closed"));
        const { signal } = callOptions;
        if (signal?.aborted) return reject(reasonOf(signal));
        const flag = new Int32Array(new SharedArrayBuffer(4));
        const request: SearchRequest = { id: randomUUID(), cancel: flag.buffer as SharedArrayBuffer, file: query.file, cacheKey: query.cacheKey, query: query.query, topK: query.topK };
        const slot = slots[slotOf(query.cacheKey, count)] as Slot;
        const pending: Pending = {
          request,
          flag,
          handle: registerTask(request.id, "search", "flag", callOptions.owner),
          settled: false,
          cancelRequested: false,
          signal,
          detach: () => undefined,
          succeed: resolve,
          fail: reject
        };
        if (signal !== undefined) {
          const onAbort = () => {
            const at = slot.queue.indexOf(pending);
            if (at >= 0) {
              slot.queue.splice(at, 1);
              counters.cancelled += 1;
              finish(slot, pending, () => reject(reasonOf(signal)));
              return;
            }
            if (slot.current !== pending) return;
            pending.cancelRequested = true;
            Atomics.store(flag, 0, 1);
            // 스레드가 플래그를 보지 못하는 일(동기 구간에 갇힘)에 대비한 안전장치: 기한 안에 응답이 없으면 스레드를 끝낸다.
            slot.graceTimer = setTimeout(() => {
              const stuck = slot.worker;
              if (stuck === null || slot.current !== pending) return;
              slot.worker = null;
              counters.restarts += 1;
              void stopThread(stuck).then(() => {
                finish(slot, pending, () => reject(abortError(pending)));
                pump(slot);
              });
            }, cancelGraceMs);
          };
          signal.addEventListener("abort", onAbort, { once: true });
          pending.detach = () => signal.removeEventListener("abort", onAbort);
        }
        slot.queue.push(pending);
        pump(slot);
      });
    },
    stats: () => ({
      workers: slots.filter((slot) => slot.worker !== null).length,
      restarts: counters.restarts,
      queued: slots.reduce((sum, slot) => sum + slot.queue.length, 0),
      running: slots.filter((slot) => slot.current !== null).length,
      cancelled: counters.cancelled
    }),
    async close() {
      closed = true;
      unregister();
      const error = new Error("search pool is closed");
      const stopping: Promise<void>[] = [];
      for (const slot of slots) {
        clearTimeout(slot.graceTimer);
        for (const pending of slot.queue.splice(0)) finish(slot, pending, () => pending.fail(error));
        const running = slot.current;
        if (running !== null) finish(slot, running, () => running.fail(error));
        const thread = slot.worker;
        slot.worker = null;
        if (thread !== null) stopping.push(stopThread(thread));
      }
      await Promise.all(stopping);
    }
  };
  unregister = onShutdown(() => pool.close());
  return pool;
}

let shared: SearchPool | undefined;

/** 프로세스 공용 풀(첫 사용 때 스레드를 띄운다). */
export function searchPool(): SearchPool {
  shared ??= createSearchPool();
  return shared;
}
