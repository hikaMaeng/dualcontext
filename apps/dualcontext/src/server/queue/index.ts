import { RunAborted, isRunAborted } from "dualcontext_domain/common";
import { DelayedSet } from "./delayed.js";
import { RunRing } from "./ring.js";

/** 당기는 순서의 우선순위. foreground = 실행의 필수 작업, background = 갱신 · 백필 · 실행 밖 호출. */
export type Priority = "foreground" | "background";

/** attempt 가 던지면 작업을 지연 큐에 다시 담는다(소비자는 즉시 다음 작업을 당긴다). */
export class RetryLater extends Error {
  constructor(readonly delayMs: number, readonly reason: unknown) {
    super(reason instanceof Error ? reason.message : String(reason));
  }
}

export type SubmitOptions = {
  /** 공정성 단위(실행). 없으면 모든 작업이 한 실행으로 본다. */
  runKey?: string;
  priority?: Priority;
  /** abort 되면 큐에서 빠지거나 실행 중이면 attempt 의 신호가 abort 된다. 작업은 RunAborted 로 reject 된다. */
  signal?: AbortSignal;
};

export type AttemptInfo = {
  /** 1부터. 재시도마다 늘어난다. */
  attempt: number;
  /** 이 시도의 신호: 작업이 취소되면 abort 된다. */
  signal: AbortSignal;
};

export type TaskQueueOptions<I, O> = {
  /** 소비자 수 = 이 큐가 동시에 처리하는 시도의 최대 수(부하의 상한). */
  workers: number;
  /** 시도 하나. 자원 정리까지 끝낸 뒤 반환해야 한다(소비자는 반환할 때까지 다음 작업을 당기지 않는다). */
  attempt: (input: I, info: AttemptInfo) => Promise<O>;
  /** background 작업이 이 시간(최초 제출 기준)보다 오래 기다리면 foreground 보다 먼저 당긴다. 기본 30초. */
  agingMs?: number;
  now?: () => number;
};

export type QueueStats = { workers: number; inFlight: number; maxInFlight: number; queued: number; delayed: number; dispatched: number; retried: number; cancelled: number };

type State = "queued" | "running" | "delayed" | "settled";

type Task<I, O> = {
  input: I;
  runKey: string;
  priority: Priority;
  submittedAt: number;
  notBefore: number;
  state: State;
  /** 취소는 되돌릴 수 없는 표식이다. 표식 뒤의 완료 · 재투입 · 타이머 만료는 모두 무시한다. */
  cancelled: boolean;
  attempts: number;
  attemptId: number;
  controller: AbortController | undefined;
  resolve: (value: O) => void;
  reject: (error: unknown) => void;
  detach: (() => void) | undefined;
};

/**
 * 큐에 담고 소비자가 당겨 가는 작업 큐. 모든 요청을 받는다(길이 상한 · 거절 없음). 부하의 상한은 소비자 수다.
 * - ready 큐(실행별 라운드로빈)와 지연 큐(재시도 대기)를 분리한다: 지연 작업의 선두가 뒤의 ready 작업을 막지 않는다.
 * - 재시도 = 지연 재투입. 소비자는 백오프 중에도 다음 작업을 당긴다.
 * - 모든 작업은 정확히 한 번 settle 한다. 취소는 큐에서 제거하고 RunAborted 로 reject 한다.
 * - 소비자는 시도 하나가 끝나야(자원 정리 포함) 다음을 당긴다.
 * 설계: docs/execution-design.md
 */
export function createTaskQueue<I, O>(options: TaskQueueOptions<I, O>) {
  const now = options.now ?? Date.now;
  const agingMs = options.agingMs ?? 30_000;
  const foreground = new RunRing<Task<I, O>>();
  const background = new RunRing<Task<I, O>>();
  const delayed = new DelayedSet<Task<I, O>>();
  const running = new Set<Task<I, O>>();
  const waiters: ((task: Task<I, O> | null) => void)[] = [];
  const stats = { maxInFlight: 0, dispatched: 0, retried: 0, cancelled: 0 };
  let open = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const ringOf = (task: Task<I, O>) => (task.priority === "foreground" ? foreground : background);

  function settle(task: Task<I, O>, outcome: { ok: true; value: O } | { ok: false; error: unknown }) {
    if (task.state === "settled") return;
    task.state = "settled";
    task.detach?.();
    task.detach = undefined;
    if (outcome.ok) task.resolve(outcome.value);
    else task.reject(outcome.error);
  }

  /** 쉬는 소비자가 있으면 바로 넘기고, 없으면 ready 큐에 둔다. */
  function enqueue(task: Task<I, O>) {
    task.state = "queued";
    const waiter = waiters.shift();
    if (waiter) waiter(task);
    else ringOf(task).push(task);
  }

  function armTimer() {
    clearTimeout(timer);
    timer = undefined;
    const at = delayed.nextAt();
    if (at === null || !open) return;
    timer = setTimeout(fire, Math.max(0, at - now()));
  }

  function fire() {
    timer = undefined;
    for (const task of delayed.takeDue(now())) if (!task.cancelled && task.state === "delayed") enqueue(task);
    armTimer();
  }

  /** 다음에 당길 작업. aging 으로 승격된 background 가 먼저고, 그다음 foreground, 마지막이 background. */
  function pullReady(): Task<I, O> | undefined {
    const oldest = background.oldestSubmittedAt();
    if (oldest !== null && now() - oldest >= agingMs) return background.shiftOldest();
    return foreground.shift() ?? background.shift();
  }

  function next(): Promise<Task<I, O> | null> {
    if (!open) return Promise.resolve(null);
    const ready = pullReady();
    if (ready) return Promise.resolve(ready);
    return new Promise((resolve) => waiters.push(resolve));
  }

  async function runAttempt(task: Task<I, O>) {
    if (task.cancelled || task.state === "settled") return;
    task.state = "running";
    task.attempts += 1;
    task.attemptId += 1;
    const attemptId = task.attemptId;
    const controller = new AbortController();
    task.controller = controller;
    running.add(task);
    stats.dispatched += 1;
    stats.maxInFlight = Math.max(stats.maxInFlight, running.size);
    try {
      const value = await options.attempt(task.input, { attempt: task.attempts, signal: controller.signal });
      // 늦게 도착한 옛 시도의 완료나 취소 뒤의 완료는 거부한다.
      if (task.cancelled || task.attemptId !== attemptId) return;
      settle(task, { ok: true, value });
    } catch (error) {
      if (task.cancelled || task.attemptId !== attemptId) return;
      if (error instanceof RetryLater && open) {
        stats.retried += 1;
        task.state = "delayed";
        task.notBefore = now() + error.delayMs;
        delayed.add(task);
        armTimer();
        return;
      }
      settle(task, { ok: false, error: error instanceof RetryLater ? error.reason : error });
    } finally {
      running.delete(task);
      task.controller = undefined;
    }
  }

  async function consume() {
    for (;;) {
      const task = await next();
      if (task === null) return;
      // 작업 하나의 예외가 소비자 루프를 끝내지 않는다(runAttempt 는 거부하지 않지만 방어한다).
      await runAttempt(task).catch(() => undefined);
    }
  }

  const consumers = Array.from({ length: Math.max(1, options.workers) }, () => consume());

  function cancel(task: Task<I, O>, reason: unknown) {
    if (task.state === "settled" || task.cancelled) return;
    task.cancelled = true;
    stats.cancelled += 1;
    if (task.state === "queued") ringOf(task).remove(task);
    else if (task.state === "delayed") {
      delayed.remove(task);
      armTimer();
    }
    const error = isRunAborted(reason) ? reason : new RunAborted("cancelled");
    // settle 이 먼저고(생산자 즉시 해제), 실행 중인 시도는 신호로 끝낸다. 소비자는 시도가 정리를 마칠 때까지 다음을 당기지 않는다.
    const controller = task.state === "running" ? task.controller : undefined;
    settle(task, { ok: false, error });
    controller?.abort(error);
  }

  return {
    /** 작업을 담고 결과(Promise)를 받는다. 거절하지 않는다(닫힌 큐만 RunAborted(shutdown)). */
    submit(input: I, submitOptions: SubmitOptions = {}): Promise<O> {
      const signal = submitOptions.signal;
      if (!open) return Promise.reject(new RunAborted("shutdown"));
      if (signal?.aborted) return Promise.reject(isRunAborted(signal.reason) ? signal.reason : new RunAborted("cancelled"));
      return new Promise<O>((resolve, reject) => {
        const task: Task<I, O> = {
          input,
          runKey: submitOptions.runKey ?? "",
          priority: submitOptions.priority ?? "foreground",
          submittedAt: now(),
          notBefore: 0,
          state: "queued",
          cancelled: false,
          attempts: 0,
          attemptId: 0,
          controller: undefined,
          resolve,
          reject,
          detach: undefined
        };
        if (signal) {
          const onAbort = () => cancel(task, signal.reason);
          signal.addEventListener("abort", onAbort, { once: true });
          task.detach = () => signal.removeEventListener("abort", onAbort);
        }
        enqueue(task);
      });
    },
    stats(): QueueStats {
      return { workers: consumers.length, inFlight: running.size, queued: foreground.size + background.size, delayed: delayed.size, ...stats };
    },
    /** 담긴 작업은 RunAborted(shutdown) 로 reject, 실행 중인 시도는 abort 하고 정리를 기다린다. */
    async close(): Promise<void> {
      if (!open) return;
      open = false;
      clearTimeout(timer);
      const error = new RunAborted("shutdown");
      for (const task of [...foreground.drain(), ...background.drain(), ...delayed.drain()]) {
        task.cancelled = true;
        settle(task, { ok: false, error });
      }
      for (const task of running) {
        task.cancelled = true;
        const controller = task.controller;
        settle(task, { ok: false, error });
        controller?.abort(error);
      }
      for (const waiter of waiters.splice(0)) waiter(null);
      await Promise.all(consumers);
    }
  };
}

export type TaskQueue<I, O> = ReturnType<typeof createTaskQueue<I, O>>;
