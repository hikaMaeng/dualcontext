import assert from "node:assert/strict";
import test from "node:test";
import { isRunAborted } from "dualcontext_domain/common";
import { budgetMs, createRunContext, runRegistry } from "./index.js";

test("취소: 처음 abort 한 사유가 남고 신호의 reason 은 RunAborted 다", () => {
  const context = createRunContext(9001);
  assert.equal(context.reason(), null);
  context.cancel("cancelled");
  context.cancel("shutdown");
  assert.equal(context.reason(), "cancelled");
  assert.equal(context.signal.aborted, true);
  assert.ok(isRunAborted(context.signal.reason));
  context.dispose();
});

test("레지스트리: 활성 실행을 취소하고, dispose 하면 사라진다", () => {
  const context = createRunContext(9002);
  assert.equal(runRegistry.get(9002), context);
  assert.equal(runRegistry.cancel(9002, "cancelled"), true);
  assert.equal(context.signal.aborted, true);
  context.dispose();
  assert.equal(runRegistry.get(9002), undefined);
  assert.equal(runRegistry.cancel(9002, "cancelled"), false);
});

test("cancelAll: 모든 활성 실행에 사유를 건다", () => {
  const a = createRunContext(9003);
  const b = createRunContext(9004);
  assert.equal(runRegistry.cancelAll("shutdown") >= 2, true);
  assert.equal(a.reason(), "shutdown");
  assert.equal(b.reason(), "shutdown");
  a.dispose();
  b.dispose();
});

test("선택 시한: budgetMs 가 있으면 타이머가 deadline 으로 abort 한다(없으면 시한 없음)", async () => {
  const context = createRunContext(9005, { budgetMs: 20 });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(context.reason(), "deadline");
  context.dispose();
  const none = createRunContext(9006);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(none.reason(), null);
  none.dispose();
});

test("budgetMs: 환경 변수 DUALCONTEXT_BUDGET_<EFFORT>_S 가 있을 때만 켠다", () => {
  assert.equal(budgetMs("middle", {}), undefined);
  assert.equal(budgetMs("middle", { DUALCONTEXT_BUDGET_MIDDLE_S: "90" }), 90_000);
  assert.equal(budgetMs("high", { DUALCONTEXT_BUDGET_MIDDLE_S: "90" }), undefined);
  assert.equal(budgetMs(undefined, { DUALCONTEXT_BUDGET_MIDDLE_S: "90" }), undefined);
  assert.equal(budgetMs("light", { DUALCONTEXT_BUDGET_LIGHT_S: "abc" }), undefined);
});
