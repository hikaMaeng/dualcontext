import assert from "node:assert/strict";
import test from "node:test";
import { createLimiter, retryOverloaded } from "./index.js";

const busy = (status: number) => Object.assign(new Error(status === 503 ? "busy" : "bad"), { status });

test("제한기는 동시 실행 수를 max 로 묶고 모두 끝까지 처리한다", async () => {
  const run = createLimiter(2);
  let active = 0;
  let peak = 0;
  const task = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return 1;
  };
  const results = await Promise.all(Array.from({ length: 7 }, () => run(task)));
  assert.equal(results.length, 7);
  assert.equal(peak, 2);
});

test("제한기는 작업이 실패해도 자리를 돌려준다", async () => {
  const run = createLimiter(1);
  await assert.rejects(run(async () => { throw new Error("x"); }));
  assert.equal(await run(async () => "ok"), "ok");
});

test("503 은 백오프로 재시도하고, 성공하면 그 값을 돌려준다", async () => {
  const waits: number[] = [];
  let calls = 0;
  const value = await retryOverloaded(async () => {
    calls += 1;
    if (calls < 3) throw busy(503);
    return "done";
  }, { attempts: 4, baseMs: 100, sleep: async (ms) => { waits.push(ms); } });
  assert.equal(value, "done");
  assert.equal(calls, 3);
  assert.equal(waits.length, 2);
  assert.ok(waits[1] > waits[0], "대기가 늘어난다");
});

test("횟수를 다 쓰면 마지막 오류를 던지고, 503 이 아닌 오류는 재시도하지 않는다", async () => {
  let calls = 0;
  await assert.rejects(retryOverloaded(async () => { calls += 1; throw busy(503); }, { attempts: 3, baseMs: 1, sleep: async () => {} }), /busy/);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(retryOverloaded(async () => { calls += 1; throw busy(400); }, { attempts: 3, baseMs: 1, sleep: async () => {} }), /bad/);
  assert.equal(calls, 1);
});
