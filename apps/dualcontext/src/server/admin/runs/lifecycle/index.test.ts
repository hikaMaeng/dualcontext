import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import type { AugmentResult, PlanTrace } from "dualcontext_domain/common";
import type { Deps, RunAugmentEngine } from "../../../augment/index.js";
import { defaultPlanConfig } from "../../../plan/config/index.js";
import { defaultRouterConfig } from "../../../routing/config/index.js";
import { startRun } from "./index.js";

const classic: AugmentResult = {
  context: "기본 컨텍스트",
  routing: { researchers: [], procedures: [] },
  researcherRouting: "embedding",
  pairs: [],
  writer: { mode: "batch", calls: 1 }
};

/** 쿼리를 기록하는 가짜 pool. plan_config 는 stored, 라우터 설정은 기본값, 새 실행 id 는 5. */
function fake(stored: unknown, answers: string[] = []) {
  const calls: { text: string; values: unknown[] }[] = [];
  const chats: string[] = [];
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      if (/select config from plan_config/.test(text)) return { rows: [{ config: stored }] };
      if (/select pipeline from router_config/.test(text)) return { rows: [{ pipeline: defaultRouterConfig() }] };
      if (/^insert into augment_runs/.test(text)) return { rows: [{ id: 5 }] };
      return { rows: [], rowCount: 0 };
    }
  } as unknown as pg.Pool;
  const model = {
    chat: async (prompt: string) => { chats.push(prompt); return answers.shift() ?? "답"; },
    embed: async () => Promise.reject(new Error("쓰지 않는다")),
    settings: async () => ({ embedding: { baseUrl: "e", model: "em", apiKey: "k" }, chat: { baseUrl: "c", model: "cm", apiKey: "k" } })
  };
  return { deps: { pool, model, dataDir: "" } as unknown as Deps, calls, chats };
}

const trace = { mode: "reevaluate", items: [], levels: [], waves: [], rounds: [], stop: "passed", ms: 1 } as unknown as PlanTrace;

test("classic 실행: 스냅샷에 계획 설정(모드 classic, 프롬프트 포함)이 남고 plan 열은 null 로 갱신된다", async () => {
  const { deps, calls } = fake(defaultPlanConfig());
  const { done } = await startRun(deps, "질의", undefined, {}, { augment: async () => classic, planContext: async () => { throw new Error("부르면 안 된다"); } });
  const outcome = await done;
  assert.equal(outcome.error, null);
  assert.equal(outcome.plan, null);
  const insert = calls.find((call) => /^insert into augment_runs/.test(call.text));
  const settings = insert?.values[1] as { plan: { mode: string; prompts: { analyze: string } } };
  assert.equal(settings.plan.mode, "classic");
  assert.equal(settings.plan.prompts.analyze, defaultPlanConfig().prompts.analyze);
  const update = calls.find((call) => /stage = 'answering'/.test(call.text));
  assert.equal(update?.values[5], null);
});

test("계획 실행: mode · override 는 이번 실행에만 적용되고, plan 이 저장되며, 진행이 plan_progress 에 기록된다", async () => {
  const { deps, calls, chats } = fake(defaultPlanConfig());
  const engine: RunAugmentEngine = {
    augment: async () => classic,
    planContext: async (query, options) => {
      assert.equal(options.config.mode, "reevaluate");
      assert.equal(options.config.maxLevels, 1);
      await options.onProgress?.({ stage: "analyze" });
      await options.ports.answer(query, "최종");
      return { context: "최종", trace };
    }
  };
  const { done } = await startRun(deps, "질의", undefined, { mode: "reevaluate", override: { maxLevels: 1 } }, engine);
  const outcome = await done;
  assert.equal(outcome.error, null);
  assert.deepEqual(outcome.plan, trace);
  const settings = calls.find((call) => /^insert into augment_runs/.test(call.text))?.values[1] as { plan: { mode: string; maxLevels: number } };
  assert.deepEqual([settings.plan.mode, settings.plan.maxLevels], ["reevaluate", 1]);
  assert.equal(calls.some((call) => /^update plan_config|^insert into plan_config/.test(call.text)), false);
  const progress = calls.find((call) => /set plan_progress/.test(call.text));
  assert.equal(JSON.parse(String(progress?.values[1])).stage, "analyze");
  const update = calls.find((call) => /stage = 'answering'/.test(call.text));
  assert.deepEqual(JSON.parse(String(update?.values[5])), trace);
  assert.equal(update?.values[2], "[]");
  // 증강 후 답변은 계획의 마지막 라운드 답(같은 최종 컨텍스트)을 그대로 쓰고, 모델은 계획 안의 answer 와 증강 전 답변에만 불린다.
  assert.equal(outcome.answers?.after.fromPlan, true);
  assert.equal(outcome.answers?.after.text, "답");
  assert.equal(chats.length, 2);
});

test("계획 실행에서 플래너가 던지면(analyze 실패) 실행은 error 로 끝난다", async () => {
  const { deps, calls } = fake({ ...defaultPlanConfig(), mode: "decompose" });
  const { done } = await startRun(deps, "질의", undefined, {}, { augment: async () => classic, planContext: async () => { throw new Error("analyze 실패"); } });
  const outcome = await done;
  assert.equal(outcome.error, "analyze 실패");
  const final = calls.find((call) => /set status = \$2/.test(call.text));
  assert.deepEqual(final?.values.slice(1, 3), ["error", "analyze 실패"]);
});
