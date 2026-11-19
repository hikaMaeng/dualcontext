import assert from "node:assert/strict";
import test from "node:test";
import type { Researcher } from "dualcontext_domain/common";
import { collect } from "../index.js";
import { createCollectQueues } from "./index.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const workers = { web: 2, store: 3, crawl: 1, codebase: 1 };

/** 동시에 도는 작업 수의 최댓값을 재는 작업. */
function probe() {
  let current = 0;
  let peak = 0;
  return {
    peak: () => peak,
    work: async () => {
      current += 1;
      peak = Math.max(peak, current);
      await sleep(15);
      current -= 1;
      return "ok";
    }
  };
}

test("모든 작업을 받고 동시에 도는 수는 종류별 소비자 수를 넘지 않는다", async () => {
  const queues = createCollectQueues(workers);
  const web = probe();
  const store = probe();
  const results = await Promise.all([
    ...Array.from({ length: 12 }, () => queues.run("web", web.work)),
    ...Array.from({ length: 12 }, () => queues.run("store", store.work))
  ]);
  assert.equal(results.length, 24);
  assert.equal(web.peak(), 2);
  assert.equal(store.peak(), 3);
  assert.equal(queues.stats().web.dispatched, 12);
  assert.equal(queues.stats().web.queued, 0);
  await queues.close();
});

test("종류는 서로의 소비자를 쓰지 않는다: 무거운 종류가 막혀도 다른 종류는 진행한다", async () => {
  const queues = createCollectQueues(workers);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const slow = queues.run("codebase", () => gate);
  const queuedBehind = queues.run("codebase", async () => "later");
  assert.equal(await queues.run("store", async () => "free"), "free");
  assert.equal(queues.stats().codebase.queued, 1);
  release();
  await slow;
  assert.equal(await queuedBehind, "later");
  await queues.close();
});

test("취소하면 큐에서 빠지고 실행 중이면 작업의 신호가 abort 된다", async () => {
  const queues = createCollectQueues(workers);
  const controller = new AbortController();
  let seen: AbortSignal | undefined;
  const running = queues.run("crawl", async (signal) => {
    seen = signal;
    await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
    return "stopped";
  }, { signal: controller.signal, runKey: "1" });
  const waiting = queues.run("crawl", async () => "never", { signal: controller.signal, runKey: "1" });
  await sleep(10);
  controller.abort();
  await assert.rejects(waiting, /cancel|abort/i);
  await assert.rejects(running, /cancel|abort/i);
  assert.equal(seen?.aborted, true);
  assert.equal(queues.stats().crawl.queued, 0);
  await queues.close();
});

test("collect 는 큐가 있으면 조사원 종류의 큐를 거치고, 오류는 그대로 올라온다", async () => {
  const queues = createCollectQueues(workers);
  const researcher = { id: 1, type: "codebase", config: {} } as unknown as Researcher;
  await assert.rejects(collect({} as never, {} as never, "/nonexistent", researcher, "q", { queues, runKey: "7" }));
  assert.equal(queues.stats().codebase.dispatched, 1);
  assert.equal(queues.stats().web.dispatched, 0);
  await queues.close();
});

test("닫은 큐는 새 작업을 shutdown 으로 거절한다", async () => {
  const queues = createCollectQueues(workers);
  await queues.close();
  await assert.rejects(queues.run("web", async () => "x"), /shutdown/);
});
