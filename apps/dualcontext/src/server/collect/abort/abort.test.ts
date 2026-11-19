import assert from "node:assert/strict";
import test from "node:test";
import { isAbort, raceAbort, throwIfAborted } from "./index.js";

test("isAbort: RunAborted 와 AbortError 만 취소로 본다", () => {
  const named = (name: string) => Object.assign(new Error("x"), { name });
  assert.equal(isAbort(named("RunAborted")), true);
  assert.equal(isAbort(named("AbortError")), true);
  assert.equal(isAbort(new DOMException("x", "AbortError")), true);
  assert.equal(isAbort(new Error("x")), false);
  assert.equal(isAbort(null), false);
  assert.equal(isAbort("AbortError"), false);
});

test("throwIfAborted: 신호가 없거나 살아 있으면 통과, 취소됐으면 사유를 던진다", () => {
  throwIfAborted(undefined);
  throwIfAborted(new AbortController().signal);
  const controller = new AbortController();
  const reason = Object.assign(new Error("cancelled"), { name: "RunAborted" });
  controller.abort(reason);
  assert.throws(() => throwIfAborted(controller.signal), (error) => error === reason);
  const plain = new AbortController();
  plain.abort();
  assert.throws(() => throwIfAborted(plain.signal), (error) => isAbort(error));
});

test("raceAbort: 신호가 먼저 오면 분기는 즉시 끝나고, 원 약속의 뒤늦은 실패는 처리되지 않은 거절이 되지 않는다", async () => {
  const controller = new AbortController();
  let fail: (error: Error) => void = () => undefined;
  const slow = new Promise<number>((_, reject) => { fail = reject; });
  const raced = raceAbort(slow, controller.signal);
  controller.abort();
  await assert.rejects(raced, (error) => isAbort(error));
  fail(new Error("late"));
  await new Promise((resolve) => setImmediate(resolve));
});

test("raceAbort: 먼저 끝나면 값 · 오류를 그대로 전하고 신호 없이도 같다", async () => {
  const controller = new AbortController();
  assert.equal(await raceAbort(Promise.resolve(7), controller.signal), 7);
  await assert.rejects(raceAbort(Promise.reject(new Error("boom")), controller.signal), /boom/);
  assert.equal(await raceAbort(Promise.resolve(1), undefined), 1);
  const done = new AbortController();
  done.abort();
  await assert.rejects(raceAbort(Promise.resolve(1), done.signal), (error) => isAbort(error));
});
