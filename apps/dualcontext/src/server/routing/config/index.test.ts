import assert from "node:assert/strict";
import test from "node:test";
import { defaultRouterConfig, routerConfigSchema } from "./index.js";

test("기본 설정은 검증 스키마를 통과하고 단계가 있다", () => {
  const config = defaultRouterConfig();
  assert.deepEqual(routerConfigSchema.parse(config), config);
  assert.equal(config.researcher.steps[0].type, "embedding");
});

test("스키마는 단계 없는 단계(stage), 알 수 없는 종류, 범위 밖 값을 거부한다", () => {
  const base = defaultRouterConfig();
  assert.equal(routerConfigSchema.safeParse({ ...base, researcher: { steps: [] } }).success, false);
  assert.equal(routerConfigSchema.safeParse({ ...base, researcher: { steps: [{ type: "magic", topK: 1, parts: true, onError: "skip" }] } }).success, false);
  assert.equal(routerConfigSchema.safeParse({ ...base, researcher: { steps: [{ type: "embedding", topK: 3, minScore: 1.5, margin: 0.05, parts: true, onError: "skip" }] } }).success, false);
  assert.equal(routerConfigSchema.safeParse({ ...base, split: { ...base.split, method: "other" } }).success, false);
  assert.equal(routerConfigSchema.safeParse({ ...base, researcher: { steps: [{ type: "llm", topK: 3, prompt: "", showScores: true, allowNone: true, parts: false, onError: "skip" }] } }).success, false);
});
