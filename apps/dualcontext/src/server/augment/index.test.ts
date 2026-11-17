import assert from "node:assert/strict";
import test from "node:test";
import type { AugmentResult, PlanItem, PlanTrace } from "dualcontext_domain/common";
import { planContext } from "dualcontext_domain/server";
import { defaultPlanConfig } from "../plan/config/index.js";
import type { Deps } from "./base/index.js";
import { planResult, runAugment, type RunAugmentEngine } from "./index.js";

const classic: AugmentResult = {
  context: "기본 컨텍스트",
  routing: { researchers: [{ name: "문서", score: 0.9, selected: true }], procedures: [] },
  researcherRouting: "embedding",
  pairs: [{ researcher: "문서", procedure: null, materialCount: 1, materials: [{ title: "t", text: "x" }], procedureRouting: "embedding" }],
  writer: { mode: "batch", calls: 1 }
};

/** pool 은 plan_config 행 하나(config)를 돌려준다. model 은 답을 차례로 꺼낸다. */
function deps(config: unknown, answers: string[] = []) {
  const prompts: string[] = [];
  const pool = { query: async () => ({ rows: config === undefined ? [] : [{ config }] }) };
  const model = { chat: async (prompt: string) => { prompts.push(prompt); return answers.shift() ?? ""; } };
  return { deps: { pool, model, dataDir: "" } as unknown as Deps, prompts };
}

const neverPlan: RunAugmentEngine["planContext"] = async () => { throw new Error("planContext 를 부르면 안 된다"); };

test("classic(저장 설정 기본값): 한 번의 기본 증강 결과 그대로, plan 은 null", async () => {
  const calls: unknown[][] = [];
  const engine: RunAugmentEngine = { augment: async (...args) => { calls.push(args.slice(1)); return classic; }, planContext: neverPlan };
  const outcome = await runAugment(deps(undefined).deps, "질의", { writerId: 3 }, engine);
  assert.deepEqual(outcome, { result: classic, plan: null });
  assert.deepEqual(calls, [["질의", 3]]);
});

test("mode 를 classic 으로 주면 저장된 설정이 계획 모드여도 기존 경로다", async () => {
  const engine: RunAugmentEngine = { augment: async () => classic, planContext: neverPlan };
  const outcome = await runAugment(deps({ ...defaultPlanConfig(), mode: "decompose" }).deps, "질의", { mode: "classic" }, engine);
  assert.equal(outcome.plan, null);
  assert.equal(outcome.result, classic);
});

const item = (id: string, name: string, top: boolean, needs: string[] = []): PlanItem => ({
  id, name, description: `${name} 설명`, level: top ? 1 : 2, top, needs, round: 0, status: "built", context: `${name} 컨텍스트`,
  pairs: [{ researcher: `${name}조사원`, procedure: null, materialCount: 0, procedureRouting: "embedding" }]
});

test("planResult: 모든 아이템 쌍을 평탄화하고 item 을 달며, 기록된 원본이 있으면 자료를 쓴다", () => {
  const trace = { items: [item("i1", "가", true, ["i2"]), item("i2", "나", false)] } as PlanTrace;
  const builds = new Map<string, AugmentResult>([[`가\u0000가 설명`, classic]]);
  const result = planResult("최종", trace, builds);
  assert.equal(result.context, "최종");
  assert.equal(result.researcherRouting, "plan");
  assert.deepEqual(result.routing, { researchers: [], procedures: [] });
  assert.deepEqual(result.writer, { mode: "batch", calls: 2 });
  assert.deepEqual(result.pairs.map((pair) => [pair.item, pair.researcher, pair.materials.length]), [["가", "문서", 1], ["나", "나조사원", 0]]);
});

test("decompose(실제 플래너 + 가짜 모델): 사전 아이템 컨텍스트가 의존하는 아이템에 제공되고, 1차 아이템만 최종에 실린다", async () => {
  const { deps: d } = deps({ ...defaultPlanConfig(), mode: "decompose", dedupe: "name", maxLevels: 2 }, [
    '{"items":[{"name":"환불 처리","description":"환불 처리 절차"}]}',
    '{"needs":[{"name":"환불 규정","description":"사내 환불 규정"}]}',
    '{"needs":[]}'
  ]);
  const built: { query: string; provided: string[] }[] = [];
  const engine: RunAugmentEngine = {
    planContext,
    augment: async (_deps, query, _writerId, provided) => {
      built.push({ query, provided: (provided ?? []).map((entry) => entry.name) });
      return { ...classic, context: `[${query}]` };
    }
  };
  const outcome = await runAugment(d, "환불 어떻게 해요", {}, engine);
  assert.ok(outcome.plan);
  assert.equal(outcome.plan.mode, "decompose");
  assert.deepEqual(built, [
    { query: "환불 규정: 사내 환불 규정", provided: [] },
    { query: "환불 처리: 환불 처리 절차", provided: ["환불 규정"] }
  ]);
  assert.match(outcome.result.context, /\[환불 처리: 환불 처리 절차\]/);
  assert.equal(outcome.result.researcherRouting, "plan");
  assert.deepEqual(outcome.result.pairs.map((pair) => pair.item).sort(), ["환불 규정", "환불 처리"]);
  assert.equal(outcome.answerAfter, undefined);
});

test("계획 모드에서 analyze 가 실패하면 오류를 숨기지 않고 던진다", async () => {
  const { deps: d } = deps({ ...defaultPlanConfig(), mode: "decompose" }, ["JSON 아님"]);
  await assert.rejects(runAugment(d, "질의", {}, { planContext, augment: async () => classic }), /JSON/);
});

/** reevaluate 를 흉내 내는 가짜 플래너: 주어진 컨텍스트로 answer 를 부르고 최종 컨텍스트를 돌려준다. */
const fakeReevaluate = (answeredWith: string, finalContext: string): RunAugmentEngine["planContext"] => async (query, options) => {
  await options.ports.answer(query, answeredWith);
  return { context: finalContext, trace: { mode: "reevaluate", items: [], rounds: [], stop: "passed" } as unknown as PlanTrace };
};

test("reevaluate: 마지막 답변이 최종 컨텍스트로 만든 것이면 answerAfter 로 넘기고(fromPlan), 다르면 넘기지 않는다", async () => {
  const same = await runAugment(deps({ ...defaultPlanConfig(), mode: "reevaluate" }, ["마지막 답"]).deps, "q", {}, { augment: async () => classic, planContext: fakeReevaluate("최종", "최종") });
  assert.equal(same.answerAfter?.text, "마지막 답");
  assert.equal(same.answerAfter?.fromPlan, true);
  const differ = await runAugment(deps({ ...defaultPlanConfig(), mode: "reevaluate" }, ["답"]).deps, "q", {}, { augment: async () => classic, planContext: fakeReevaluate("이전", "최종") });
  assert.equal(differ.answerAfter, undefined);
  const decompose = await runAugment(deps({ ...defaultPlanConfig(), mode: "decompose" }, ["답"]).deps, "q", {}, { augment: async () => classic, planContext: fakeReevaluate("최종", "최종") });
  assert.equal(decompose.answerAfter, undefined);
});

test("options.config 를 주면 저장 설정을 읽지 않고 그 설정(모드 포함)으로 돈다", async () => {
  let read = false;
  const d = { pool: { query: async () => { read = true; return { rows: [] }; } }, model: { chat: async () => "" }, dataDir: "" } as unknown as Deps;
  let seenMode = "";
  await runAugment(d, "q", { config: { ...defaultPlanConfig(), mode: "decompose", maxLevels: 1 } }, {
    augment: async () => classic,
    planContext: async (_q, options) => { seenMode = `${options.config.mode}/${options.config.maxLevels}`; return { context: "", trace: { items: [] } as unknown as PlanTrace }; }
  });
  assert.equal(read, false);
  assert.equal(seenMode, "decompose/1");
});

test("onNode: classic 은 증강 한 번의 모델 호출을 classic 노드로, 계획 모드는 analyze · item 노드로 내보낸다", async () => {
  const sent: { key: string; patch: Record<string, any> }[] = [];
  const engineClassic: RunAugmentEngine = {
    augment: async (d) => { await d.model.chat("라우팅 프롬프트"); return classic; },
    planContext: neverPlan
  };
  await runAugment(deps(undefined, ["응답"]).deps, "질의", {}, engineClassic);
  const none = await runAugment(deps(undefined, ["응답"]).deps, "질의", { onNode: (key, patch) => sent.push({ key, patch }) }, engineClassic);
  assert.equal(none.result, classic);
  assert.deepEqual(sent.map((entry) => entry.key), ["classic"]);
  assert.equal(sent[0].patch.calls[0].prompt, "라우팅 프롬프트");
  assert.equal(sent[0].patch.calls[0].response, "응답");

  sent.length = 0;
  const engine: RunAugmentEngine = {
    planContext,
    augment: async (inner, query) => { await inner.model.chat(`라이터:${query}`); return { ...classic, context: `[${query}]` }; }
  };
  const withSink = await runAugment(deps({ ...defaultPlanConfig(), mode: "decompose", dedupe: "name", maxLevels: 2 }, ['{"items":[{"name":"환불 처리","description":"절차"}]}', '{"needs":[]}', "x"]).deps, "q", { onNode: (key, patch) => sent.push({ key, patch }) }, engine);
  assert.ok(withSink.plan);
  const keys = sent.map((entry) => entry.key);
  assert.ok(keys.includes("analyze") && keys.includes("item:i1"));
  const item = sent.filter((entry) => entry.key === "item:i1").reduce((all, entry) => ({ ...all, ...entry.patch }), {} as Record<string, any>);
  assert.equal(item.calls[0].prompt, "라이터:환불 처리: 절차");
  assert.ok(item.prerequisitesCalls.length === 1);
  assert.equal(item.augment.context, "[환불 처리: 절차]");
});
