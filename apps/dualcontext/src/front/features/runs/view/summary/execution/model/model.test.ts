/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { readExecutionPlan } from "./index";

test("스냅샷의 모드 · 한도 · 라이터를 읽는다", () => {
  const plan = readExecutionPlan({
    plan: { mode: "reevaluate", maxLevels: 3, maxNeedsPerItem: 4, maxItems: 16, maxProvidedChars: 3000, dedupe: "llm", reevaluate: { maxRounds: 2, passScore: 80, maxMissing: 0, maxNewItems: 4 }, prompts: {} },
    writer: { id: 1, name: "일괄 종합(LLM)", engine: "llm", mode: "batch", prompt: "x" }
  });
  assert.equal(plan.mode, "reevaluate");
  assert.equal(plan.hasLimits, true);
  assert.deepEqual(plan.limits, { maxLevels: 3, maxNeedsPerItem: 4, maxItems: 16, maxProvidedChars: 3000, dedupe: "llm" });
  assert.deepEqual(plan.reevaluate, { maxRounds: 2, passScore: 80, maxMissing: 0, maxNewItems: 4 });
  assert.deepEqual(plan.writer, { name: "일괄 종합(LLM)", mode: "batch" });
});

test("settings.plan 이 없으면 plan 기록의 모드를, 그것도 없으면 classic 이고 한도는 없다", () => {
  assert.equal(readExecutionPlan({}, "decompose").mode, "decompose");
  const none = readExecutionPlan(undefined, null);
  assert.equal(none.mode, "classic");
  assert.equal(none.hasLimits, false);
  assert.deepEqual(none.limits, {});
  assert.equal(none.writer, null);
});

test("계약 밖 값은 무시한다(던지지 않는다)", () => {
  const plan = readExecutionPlan({ plan: { mode: "weird", maxLevels: "3", dedupe: "x", reevaluate: 5 }, writer: { name: 3 } });
  assert.equal(plan.mode, "classic");
  assert.deepEqual(plan.limits, {});
  assert.deepEqual(plan.reevaluate, {});
  assert.equal(plan.writer, null);
  assert.doesNotThrow(() => readExecutionPlan([], 7 as unknown as string));
  assert.doesNotThrow(() => readExecutionPlan("text"));
});

test("라이터 방식이 낯설면 이름만 남긴다", () => {
  assert.deepEqual(readExecutionPlan({ writer: { name: "w", mode: "other" } }).writer, { name: "w", mode: null });
});
