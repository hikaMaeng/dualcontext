import assert from "node:assert/strict";
import test from "node:test";
import { isAbort } from "../../collect/abort/index.js";
import { createRegexPool, judgeTargets, regexLimits } from "./index.js";

test("판정: 제외가 먼저이고 포함 패턴이 비면 조건 없음, 2048자를 넘는 대상은 제외", () => {
  const targets = ["/docs/a", "/docs/old/a", "/blog", `/docs/${"x".repeat(regexLimits.targetChars)}`];
  assert.deepEqual(judgeTargets(["^/docs"], ["^/docs/old"], targets), [true, false, false, false]);
  assert.deepEqual(judgeTargets([], [], targets), [true, true, true, false]);
  assert.deepEqual(judgeTargets([], ["blog"], ["/blog", "/x"]), [false, true]);
});

test("cpu.regex 스레드: 판정 결과가 스레드 밖에서 계산한 값과 같고 묶음은 50개씩 나뉜다", async () => {
  const pool = createRegexPool();
  try {
    const targets = Array.from({ length: 120 }, (_, i) => (i % 3 === 0 ? `/docs/p${i}` : i % 3 === 1 ? `/docs/old/p${i}` : `/blog/p${i}`));
    const wanted = await pool.filter(["^/docs"], ["^/docs/old"], targets);
    assert.deepEqual(wanted, judgeTargets(["^/docs"], ["^/docs/old"], targets));
    assert.equal(wanted.filter(Boolean).length, 40);
    assert.deepEqual(await pool.filter([], [], []), []);
    assert.equal(pool.stats().spawns, 1, "같은 스레드를 계속 쓴다");
  } finally {
    await pool.close();
  }
});

test("cpu.regex 스레드: 폭주 정규식은 시한 뒤 스레드를 끝내고 그 묶음을 전부 제외하며, 다음 작업은 새 스레드에서 정상 처리한다", async () => {
  const pool = createRegexPool({ timeoutMs: 200 });
  try {
    const evil = `/${"a".repeat(40)}!`;
    const started = performance.now();
    const wanted = await pool.filter([], ["^/(a+)+$"], [evil, "/ok"]);
    const elapsed = performance.now() - started;
    assert.deepEqual(wanted, [false, false], "묶음의 링크는 전부 제외");
    assert.ok(elapsed < 5000, `${elapsed.toFixed(0)}ms`);
    assert.equal(pool.stats().timeouts, 1);
    assert.deepEqual(await pool.filter([], ["^/blog"], ["/docs", "/blog/x"]), [true, false]);
    assert.equal(pool.stats().spawns, 2, "종료 뒤 스레드를 다시 만들었다");
  } finally {
    await pool.close();
  }
});

test("cpu.regex 스레드: 대기 중 취소는 큐에서 빠지고, 실행 중 취소는 스레드를 끝낸 뒤 취소 오류로 끝나며, 풀은 복구된다", async () => {
  const pool = createRegexPool({ timeoutMs: 60_000 });
  try {
    const controller = new AbortController();
    const running = pool.filter([], ["^/(a+)+$"], [`/${"a".repeat(45)}!`], { signal: controller.signal });
    const queuedController = new AbortController();
    const queued = pool.filter([], [], ["/x"], { signal: queuedController.signal });
    queuedController.abort();
    await assert.rejects(queued, (error) => isAbort(error));
    await new Promise((resolve) => setTimeout(resolve, 300));
    controller.abort();
    await assert.rejects(running, (error) => isAbort(error));
    assert.deepEqual(await pool.filter(["^/a"], [], ["/a", "/b"]), [true, false]);
  } finally {
    await pool.close();
  }
});

test("cpu.regex 스레드: 닫은 풀은 새 작업을 거절한다", async () => {
  const pool = createRegexPool();
  await pool.close();
  await assert.rejects(pool.filter([], [], ["/x"]), /closed/);
});
