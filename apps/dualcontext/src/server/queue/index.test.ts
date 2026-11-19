import assert from "node:assert/strict";
import test from "node:test";
import { RunAborted } from "dualcontext_domain/common";
import { createTaskQueue, RetryLater } from "./index.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const gate = () => {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
};

test("동시 시도 수는 소비자 수를 넘지 않고, 소비자가 비면 즉시 다음 작업을 당긴다", async () => {
  let active = 0;
  let peak = 0;
  const queue = createTaskQueue<number, number>({
    workers: 3,
    attempt: async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await wait(15);
      active -= 1;
      return n;
    }
  });
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => queue.submit(i)));
  assert.deepEqual(results, Array.from({ length: 12 }, (_, i) => i));
  assert.equal(peak, 3, "대기 작업이 있으면 소비자 수만큼 항상 돌아야 한다(놀지 않는다)");
  await queue.close();
});

test("모든 요청을 받는다: 큐 길이 상한이나 거절이 없다", async () => {
  const hold = gate();
  const queue = createTaskQueue<number, number>({ workers: 1, attempt: async (n) => { await hold.promise; return n; } });
  const submitted = Array.from({ length: 5000 }, (_, i) => queue.submit(i));
  assert.equal(queue.stats().queued, 4999);
  hold.open();
  assert.equal((await Promise.all(submitted)).length, 5000);
  await queue.close();
});

test("실행 사이 라운드로빈: 한 실행이 큰 웨이브를 먼저 담아도 다른 실행의 첫 작업이 전체 웨이브 뒤로 밀리지 않는다", async () => {
  const order: string[] = [];
  const hold = gate();
  const queue = createTaskQueue<string, string>({ workers: 1, attempt: async (label) => { order.push(label); if (label === "A0") await hold.promise; return label; } });
  const all = [queue.submit("A0", { runKey: "A" })];
  await wait(5);
  for (let i = 1; i <= 5; i += 1) all.push(queue.submit(`A${i}`, { runKey: "A" }));
  all.push(queue.submit("B0", { runKey: "B" }));
  hold.open();
  await Promise.all(all);
  assert.ok(order.indexOf("B0") <= 2, `B0 는 A 의 웨이브 뒤가 아니라 곧바로 당겨져야 한다: ${order.join(",")}`);
  await queue.close();
});

test("한 실행만 남으면 그 실행이 모든 소비자를 쓴다(몫 상한 없음)", async () => {
  let active = 0;
  let peak = 0;
  const queue = createTaskQueue<number, void>({ workers: 4, attempt: async () => { active += 1; peak = Math.max(peak, active); await wait(10); active -= 1; } });
  await Promise.all(Array.from({ length: 8 }, (_, i) => queue.submit(i, { runKey: "only" })));
  assert.equal(peak, 4);
  await queue.close();
});

test("재시도는 지연 재투입이다: 백오프 중에도 소비자는 다른 작업을 처리한다", async () => {
  const done: string[] = [];
  let tries = 0;
  const queue = createTaskQueue<string, string>({
    workers: 1,
    attempt: async (label, info) => {
      if (label === "flaky" && info.attempt === 1) { tries += 1; throw new RetryLater(60, new Error("503")); }
      done.push(label);
      return label;
    }
  });
  const flaky = queue.submit("flaky");
  const quick = await queue.submit("quick");
  assert.equal(quick, "quick");
  assert.deepEqual(done, ["quick"], "백오프 중인 작업이 소비자를 점유하면 quick 이 기다려야 한다");
  assert.equal(await flaky, "flaky");
  assert.equal(tries, 1);
  assert.equal(queue.stats().retried, 1);
  await queue.close();
});

test("지연 작업의 선두가 뒤의 ready 작업을 막지 않고, 소비자가 모두 자고 있어도 타이머가 깨운다", async () => {
  const queue = createTaskQueue<string, string>({
    workers: 2,
    attempt: async (label, info) => { if (label === "late" && info.attempt === 1) throw new RetryLater(40, new Error("429")); return label; }
  });
  const started = Date.now();
  const late = queue.submit("late");
  assert.equal(await queue.submit("ready"), "ready");
  assert.equal(await late, "late");
  assert.ok(Date.now() - started >= 35, "지연 시각 전에 다시 실행되면 안 된다");
  await queue.close();
});

test("취소(대기 중): 큐에서 빠지고 RunAborted 로 reject, 시도는 한 번도 시작하지 않는다", async () => {
  const hold = gate();
  const started: string[] = [];
  const queue = createTaskQueue<string, string>({ workers: 1, attempt: async (label) => { started.push(label); await hold.promise; return label; } });
  const first = queue.submit("first");
  const controller = new AbortController();
  const second = queue.submit("second", { signal: controller.signal });
  controller.abort(new RunAborted("cancelled"));
  await assert.rejects(second, (error: unknown) => error instanceof RunAborted && error.reason === "cancelled");
  hold.open();
  await first;
  assert.deepEqual(started, ["first"]);
  assert.equal(queue.stats().queued, 0);
  await queue.close();
});

test("취소(재시도 대기 중): 지연 큐에서 빠지고 이후 다시 실행되지 않는다", async () => {
  let attempts = 0;
  const queue = createTaskQueue<string, string>({ workers: 1, attempt: async () => { attempts += 1; throw new RetryLater(30, new Error("503")); } });
  const controller = new AbortController();
  const task = queue.submit("x", { signal: controller.signal });
  await wait(10);
  assert.equal(queue.stats().delayed, 1);
  controller.abort(new RunAborted("cancelled"));
  await assert.rejects(task, RunAborted);
  await wait(60);
  assert.equal(attempts, 1, "취소 뒤 재투입 금지");
  assert.equal(queue.stats().delayed, 0);
  await queue.close();
});

test("취소(실행 중): 생산자는 즉시 풀리고 시도의 신호가 abort 되며, 소비자는 시도가 끝난 뒤에야 다음을 당긴다", async () => {
  const events: string[] = [];
  const queue = createTaskQueue<string, string>({
    workers: 1,
    attempt: async (label, info) => {
      events.push(`start:${label}`);
      if (label === "slow") {
        await new Promise<void>((resolve) => info.signal.addEventListener("abort", () => resolve(), { once: true }));
        await wait(20);
        events.push("cleanup:slow");
        throw info.signal.reason;
      }
      events.push(`end:${label}`);
      return label;
    }
  });
  const controller = new AbortController();
  const slow = queue.submit("slow", { signal: controller.signal });
  const after = queue.submit("after");
  await wait(10);
  controller.abort(new RunAborted("cancelled"));
  await assert.rejects(slow, RunAborted);
  assert.equal(await after, "after");
  assert.deepEqual(events, ["start:slow", "cleanup:slow", "start:after", "end:after"], "정리가 끝나기 전에 다음 작업이 시작되면 로컬 실행이 겹친다");
  await queue.close();
});

test("취소 뒤 늦게 도착한 완료는 무시된다(정확히 한 번만 settle)", async () => {
  const queue = createTaskQueue<string, string>({ workers: 1, attempt: async () => { await wait(30); return "late-success"; } });
  const controller = new AbortController();
  const task = queue.submit("x", { signal: controller.signal });
  await wait(5);
  controller.abort(new RunAborted("cancelled"));
  await assert.rejects(task, RunAborted);
  await wait(50);
  await queue.close();
});

test("이미 abort 된 신호는 큐에 담지 않고 시도하지 않는다", async () => {
  let attempts = 0;
  const queue = createTaskQueue<number, number>({ workers: 1, attempt: async (n) => { attempts += 1; return n; } });
  const controller = new AbortController();
  controller.abort(new RunAborted("deadline"));
  await assert.rejects(queue.submit(1, { signal: controller.signal }), (error: unknown) => error instanceof RunAborted && error.reason === "deadline");
  assert.equal(attempts, 0);
  await queue.close();
});

test("일반 실패는 해당 작업만 거부하고 소비자 루프는 계속 돈다", async () => {
  const queue = createTaskQueue<number, number>({ workers: 1, attempt: async (n) => { if (n === 1) throw new Error("boom"); return n; } });
  await assert.rejects(queue.submit(1), /boom/);
  assert.equal(await queue.submit(2), 2);
  await queue.close();
});

test("aging: 오래 기다린 background 작업은 foreground 보다 먼저 당겨진다", async () => {
  let clock = 0;
  const order: string[] = [];
  const hold = gate();
  const queue = createTaskQueue<string, string>({
    workers: 1,
    agingMs: 1000,
    now: () => clock,
    attempt: async (label) => { order.push(label); if (label === "blocker") await hold.promise; return label; }
  });
  const all = [queue.submit("blocker")];
  await wait(5);
  all.push(queue.submit("bg", { priority: "background" }));
  clock = 5000;
  all.push(queue.submit("fg1"), queue.submit("fg2"));
  hold.open();
  await Promise.all(all);
  assert.deepEqual(order, ["blocker", "bg", "fg1", "fg2"], `기아 방지: ${order.join(",")}`);
  await queue.close();
});

test("foreground 가 background 보다 먼저 당겨진다", async () => {
  const order: string[] = [];
  const hold = gate();
  const queue = createTaskQueue<string, string>({ workers: 1, attempt: async (label) => { order.push(label); if (label === "blocker") await hold.promise; return label; } });
  const all = [queue.submit("blocker")];
  await wait(5);
  all.push(queue.submit("bg", { priority: "background" }), queue.submit("fg"));
  hold.open();
  await Promise.all(all);
  assert.deepEqual(order, ["blocker", "fg", "bg"]);
  await queue.close();
});

test("close: 담긴 작업은 RunAborted(shutdown), 실행 중 시도는 abort 되고 소비자가 정리된다", async () => {
  const queue = createTaskQueue<string, string>({
    workers: 1,
    attempt: async (_label, info) => { await new Promise<void>((resolve) => info.signal.addEventListener("abort", () => resolve(), { once: true })); throw info.signal.reason; }
  });
  const running = queue.submit("running");
  const queued = queue.submit("queued");
  await wait(5);
  await queue.close();
  await assert.rejects(running, (error: unknown) => error instanceof RunAborted && error.reason === "shutdown");
  await assert.rejects(queued, (error: unknown) => error instanceof RunAborted && error.reason === "shutdown");
  await assert.rejects(queue.submit("after-close"), RunAborted);
});
