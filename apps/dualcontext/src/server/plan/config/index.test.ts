import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import { applyPlanOverride, defaultPlanConfig, planConfigSchema, planOverrideSchema, readPlanConfig } from "./index.js";

const poolWith = (rows: unknown[]) => ({ query: async () => ({ rows }) }) as unknown as pg.Pool;

test("기본 설정은 classic(기존 동작 보존)이고 스키마를 통과한다", () => {
  const config = defaultPlanConfig();
  assert.equal(config.mode, "classic");
  assert.deepEqual({ maxLevels: config.maxLevels, maxNeedsPerItem: config.maxNeedsPerItem, maxItems: config.maxItems, dedupe: config.dedupe }, { maxLevels: 3, maxNeedsPerItem: 4, maxItems: 16, dedupe: "llm" });
  assert.deepEqual(config.reevaluate, { maxRounds: 2, passScore: 80, maxMissing: 0, maxNewItems: 4 });
  assert.equal(planConfigSchema.safeParse(config).success, true);
  for (const key of ["analyze", "prerequisites", "dedupe", "evaluate"] as const) assert.match(config.prompts[key], /JSON/);
});

test("스키마는 계약의 범위를 지킨다", () => {
  const bad = (patch: object) => planConfigSchema.safeParse({ ...defaultPlanConfig(), ...patch }).success;
  assert.equal(bad({ maxLevels: 0 }), false);
  assert.equal(bad({ maxLevels: 7 }), false);
  assert.equal(bad({ maxNeedsPerItem: 9 }), false);
  assert.equal(bad({ maxItems: 41 }), false);
  assert.equal(bad({ maxProvidedChars: 499 }), false);
  assert.equal(bad({ maxProvidedChars: 20001 }), false);
  assert.equal(bad({ maxProvidedChars: 500 }), true);
  assert.equal(bad({ mode: "other" }), false);
  assert.equal(bad({ dedupe: "embedding" }), false);
  assert.equal(bad({ reevaluate: { maxRounds: 6, passScore: 80, maxMissing: 0, maxNewItems: 4 } }), false);
  assert.equal(bad({ reevaluate: { maxRounds: 2, passScore: 101, maxMissing: 0, maxNewItems: 4 } }), false);
  assert.equal(bad({ reevaluate: { maxRounds: 2, passScore: 80, maxMissing: 0, maxNewItems: 0 } }), false);
  assert.equal(bad({ prompts: { ...defaultPlanConfig().prompts, analyze: " " } }), false);
  assert.equal(bad({ maxLevels: 1, reevaluate: { maxRounds: 0, passScore: 0, maxMissing: 40, maxNewItems: 8 } }), true);
});

test("readPlanConfig: 행이 없으면 기본값, 옛 행에 빠진 필드는 기본값으로 채운다", async () => {
  assert.deepEqual(await readPlanConfig(poolWith([])), defaultPlanConfig());
  const read = await readPlanConfig(poolWith([{ config: { mode: "decompose", reevaluate: { passScore: 60 }, prompts: { analyze: "내 프롬프트 {{query}}" } } }]));
  assert.equal(read.mode, "decompose");
  assert.equal(read.maxItems, 16);
  // 필드가 생기기 전에 저장된 행에도 기본 3000 이 채워진다.
  assert.equal(read.maxProvidedChars, 3000);
  assert.equal(defaultPlanConfig().maxProvidedChars, 3000);
  assert.deepEqual(read.reevaluate, { maxRounds: 2, passScore: 60, maxMissing: 0, maxNewItems: 4 });
  assert.equal(read.prompts.analyze, "내 프롬프트 {{query}}");
  assert.equal(read.prompts.evaluate, defaultPlanConfig().prompts.evaluate);
  await assert.rejects(readPlanConfig(poolWith([{ config: { maxLevels: 99 } }])));
});

test("override: 숫자 한도만 받고, 이번 실행 설정에만 얹는다", () => {
  assert.equal(planOverrideSchema.safeParse({ maxLevels: 2, reevaluate: { passScore: 90 } }).success, true);
  assert.equal(planOverrideSchema.safeParse({ prompts: { analyze: "x" } }).success, false);
  assert.equal(planOverrideSchema.safeParse({ dedupe: "name" }).success, false);
  assert.equal(planOverrideSchema.safeParse({ maxLevels: 9 }).success, false);
  assert.equal(planOverrideSchema.safeParse({ maxProvidedChars: 1000 }).success, true);
  assert.equal(planOverrideSchema.safeParse({ maxProvidedChars: 100 }).success, false);
  assert.equal(applyPlanOverride(defaultPlanConfig(), undefined, { maxProvidedChars: 1000 }).maxProvidedChars, 1000);
  const stored = defaultPlanConfig();
  const applied = applyPlanOverride(stored, "reevaluate", { maxLevels: 1, reevaluate: { passScore: 90 } });
  assert.equal(applied.mode, "reevaluate");
  assert.equal(applied.maxLevels, 1);
  assert.equal(applied.maxItems, 16);
  assert.deepEqual(applied.reevaluate, { maxRounds: 2, passScore: 90, maxMissing: 0, maxNewItems: 4 });
  assert.equal(stored.mode, "classic");
  assert.equal(stored.maxLevels, 3);
  assert.equal(applyPlanOverride(stored).mode, "classic");
});

test("옛 기본 프롬프트 승격: 이전 기본값과 같은 키만 새 기본값으로 바꾸고, 관리자가 고친 키는 그대로 둔다", async () => {
  const { legacyPlanPrompts } = await import("../prompts/legacy/index.js");
  const { upgradeLegacyPrompts, ensurePlanConfig } = await import("./index.js");
  const old = { ...defaultPlanConfig(), mode: "decompose", prompts: { ...legacyPlanPrompts[0], analyze: "관리자가 고친 {{query}}" } };
  const { config, upgraded } = upgradeLegacyPrompts(old);
  assert.deepEqual(upgraded.sort(), ["dedupe", "evaluate", "prerequisites"]);
  const next = config as typeof old;
  assert.equal(next.prompts.analyze, "관리자가 고친 {{query}}");
  assert.equal(next.prompts.prerequisites, defaultPlanConfig().prompts.prerequisites);
  assert.equal(next.mode, "decompose");
  assert.deepEqual(upgradeLegacyPrompts(defaultPlanConfig()).upgraded, []);
  assert.deepEqual(upgradeLegacyPrompts(null).upgraded, []);

  const queries: { text: string; values: unknown[] }[] = [];
  const pool = { query: async (text: string, values: unknown[] = []) => { queries.push({ text, values }); return { rows: /^select/.test(text) ? [{ config: old }] : [] }; } } as unknown as pg.Pool;
  await ensurePlanConfig(pool);
  const update = queries.find((query) => /^update plan_config/.test(query.text));
  assert.equal(JSON.parse(String(update?.values[0])).prompts.analyze, "관리자가 고친 {{query}}");
  const untouched: { text: string }[] = [];
  const fresh = { query: async (text: string) => { untouched.push({ text }); return { rows: /^select/.test(text) ? [{ config: defaultPlanConfig() }] : [] }; } } as unknown as pg.Pool;
  await ensurePlanConfig(fresh);
  assert.equal(untouched.some((query) => /^update/.test(query.text)), false);
});
