import assert from "node:assert/strict";
import test from "node:test";
import type { ContextPlanConfig, PlanEvaluation } from "../../common/index.js";
import { planContext, type PlanPorts, type Provided } from "./index.js";
import { roundItemBudget } from "./reevaluate/index.js";

const config = (over: Partial<ContextPlanConfig> = {}, re: Partial<ContextPlanConfig["reevaluate"]> = {}): ContextPlanConfig => ({
  mode: "decompose",
  maxLevels: 4,
  maxNeedsPerItem: 4,
  maxItems: 40,
  maxProvidedChars: 4000,
  dedupe: "name",
  prompts: { analyze: "", prerequisites: "", dedupe: "", evaluate: "" },
  ...over,
  reevaluate: { maxRounds: 2, passScore: 80, maxMissing: 0, maxNewItems: 3, ...re }
});

type Eval = Omit<PlanEvaluation, "pass">;
const evalOf = (score: number, missing: string[] = []): Eval => ({
  score, reason: "판단", missing: missing.map((name) => ({ name, description: `${name} 설명` }))
});

/** 기록하는 fake ports. build 컨텍스트는 `ctx:<이름>` 이다. */
function fake(spec: {
  analyze: string[] | Error;
  prereq?: Record<string, string[]>;
  failBuild?: string[];
  /** 이름 → 앞에서부터 이 횟수만큼 build 가 실패한다(재빌드 검증용). */
  failBuildTimes?: Record<string, number>;
  /** 이 이름들은 prerequisites 가 던진다. */
  failPrereq?: string[];
  emptyBuild?: string[];
  evaluations?: (Eval | Error)[];
  answerError?: boolean;
}) {
  const log = {
    events: [] as string[],
    provided: {} as Record<string, Provided[]>,
    prereqCalls: [] as string[],
    answers: [] as string[],
    builds: [] as string[]
  };
  let evalIndex = 0;
  const ports: PlanPorts = {
    analyze: async () => {
      if (spec.analyze instanceof Error) throw spec.analyze;
      return spec.analyze.map((name) => ({ name, description: `${name} 설명` }));
    },
    prerequisites: async (_q, item) => {
      log.prereqCalls.push(item.name);
      if (spec.failPrereq?.includes(item.name)) throw new Error(`${item.name} 분석 실패`);
      return (spec.prereq?.[item.name] ?? []).map((name) => ({ name, description: `${name} 설명` }));
    },
    dedupe: async () => { throw new Error("name 모드"); },
    build: async (_q, item, provided) => {
      log.events.push(`start:${item.name}`);
      log.builds.push(item.name);
      log.provided[item.name] = provided;
      await new Promise((resolve) => setImmediate(resolve));
      log.events.push(`end:${item.name}`);
      if (spec.failBuild?.includes(item.name)) throw new Error(`${item.name} 실패`);
      if ((spec.failBuildTimes?.[item.name] ?? 0) > 0) {
        spec.failBuildTimes![item.name] -= 1;
        throw new Error(`${item.name} 일시 실패`);
      }
      if (spec.emptyBuild?.includes(item.name)) return { context: "", pairs: [] };
      return { context: `ctx:${item.name}`, pairs: [{ researcher: "r", procedure: null, materialCount: 1, procedureRouting: "keyword" }] };
    },
    answer: async (_q, context) => {
      if (spec.answerError) throw new Error("답변 실패");
      log.answers.push(context);
      return `답:${log.answers.length}`;
    },
    evaluate: async () => {
      const next = spec.evaluations?.[evalIndex++] ?? evalOf(100);
      if (next instanceof Error) throw next;
      return next;
    }
  };
  let t = 0;
  return { ports, log, now: () => (t += 1) };
}

test("1차만(의존 없음): 한 웨이브로 병렬 build, top 컨텍스트를 섹션으로 잇고 decompose 로 끝난다", async () => {
  const { ports, log, now } = fake({ analyze: ["환불 규정", "결제 수단", "환불규정"] });
  const { context, trace } = await planContext("q", { config: config(), ports, now });
  assert.equal(context, "## 환불 규정\n\nctx:환불 규정\n\n## 결제 수단\n\nctx:결제 수단");
  assert.equal(trace.stop, "mode-decompose");
  assert.equal(trace.mode, "decompose");
  assert.deepEqual(trace.waves, [["i1", "i2"]]);
  assert.deepEqual(trace.levels, [{ level: 2, analyzed: 2, candidates: 0, created: 0, linked: 0 }]);
  assert.deepEqual(trace.rounds, []);
  assert.deepEqual(log.events, ["start:환불 규정", "start:결제 수단", "end:환불 규정", "end:결제 수단"]);
  assert.equal(trace.items[0].status, "built");
  assert.equal(trace.items[0].pairs.length, 1);
  assert.equal(typeof trace.items[0].ms, "number");
  assert.deepEqual(trace.limits, {
    maxLevels: 4, maxNeedsPerItem: 4, maxItems: 40, maxProvidedChars: 4000, dedupe: "name",
    reevaluate: { maxRounds: 2, passScore: 80, maxMissing: 0, maxNewItems: 3 }
  });
  assert.equal(typeof trace.ms, "number");
});

test("3단계 의존: 종단점부터 만들고 사전 컨텍스트를 provided 로 정확히 건넨다", async () => {
  const { ports, log, now } = fake({ analyze: ["환불 처리"], prereq: { "환불 처리": ["환불 규정", "주문 상태"], "환불 규정": ["약관"] } });
  const { context, trace } = await planContext("q", { config: config(), ports, now });
  assert.deepEqual(trace.items.map((i) => [i.id, i.name, i.level, i.needs]), [
    ["i1", "환불 처리", 1, ["i2", "i3"]], ["i2", "환불 규정", 2, ["i4"]], ["i3", "주문 상태", 2, []], ["i4", "약관", 3, []]
  ]);
  assert.deepEqual(trace.waves, [["i3", "i4"], ["i2"], ["i1"]]);
  assert.deepEqual(log.provided["약관"], []);
  assert.deepEqual(log.provided["환불 규정"], [{ name: "약관", context: "ctx:약관" }]);
  assert.deepEqual(log.provided["환불 처리"], [{ name: "환불 규정", context: "ctx:환불 규정" }, { name: "주문 상태", context: "ctx:주문 상태" }]);
  assert.equal(context, "## 환불 처리\n\nctx:환불 처리", "사전 아이템은 최종 컨텍스트에 싣지 않는다");
});

test("공유 사전 아이템은 한 번만 만들고, 웨이브는 앞 웨이브가 모두 끝난 뒤 병렬로 시작한다", async () => {
  const { ports, log, now } = fake({ analyze: ["환불", "교환"], prereq: { 환불: ["고객 등급"], 교환: ["고객-등급"] } });
  const { trace } = await planContext("q", { config: config(), ports, now });
  assert.equal(trace.items.length, 3);
  assert.deepEqual(trace.waves, [["i3"], ["i1", "i2"]]);
  assert.deepEqual(log.builds.filter((n) => n === "고객 등급"), ["고객 등급"]);
  assert.deepEqual(log.events, ["start:고객 등급", "end:고객 등급", "start:환불", "start:교환", "end:환불", "end:교환"]);
  assert.deepEqual(log.provided["교환"], [{ name: "고객 등급", context: "ctx:고객 등급" }]);
});

test("순환이 되는 의존은 걸지 않는다", async () => {
  const { ports, now } = fake({ analyze: ["A", "B"], prereq: { A: ["B"], B: ["A"] } });
  const { trace } = await planContext("q", { config: config(), ports, now });
  assert.deepEqual(trace.items.map((i) => i.needs), [["i2"], []]);
  assert.deepEqual(trace.waves, [["i2"], ["i1"]]);
});

test("maxLevels=1 이면 의존성 분석을 부르지 않고, maxItems 는 1차 아이템에도 적용된다", async () => {
  const { ports, log, now } = fake({ analyze: ["a", "b", "c"], prereq: { a: ["x"] } });
  const { trace } = await planContext("q", { config: config({ maxLevels: 1, maxItems: 2 }), ports, now });
  assert.deepEqual(log.prereqCalls, []);
  assert.deepEqual(trace.items.map((i) => i.name), ["a", "b"]);
  assert.deepEqual(trace.levels, []);
});

test("build 실패는 그 아이템만 error 로 남고, 의존하는 쪽은 그 컨텍스트 없이 진행한다", async () => {
  const { ports, log, now } = fake({ analyze: ["a", "b"], prereq: { a: ["p", "q"] }, failBuild: ["p", "b"], emptyBuild: ["q"] });
  const { context, trace } = await planContext("q", { config: config(), ports, now });
  const byName = Object.fromEntries(trace.items.map((i) => [i.name, i]));
  assert.equal(byName.p.status, "error");
  assert.equal(byName.p.error, "p 실패");
  assert.equal(byName.q.status, "empty");
  assert.equal(byName.b.status, "error");
  assert.deepEqual(log.provided.a, []);
  assert.equal(context, "## a\n\nctx:a");
});

test("아이템이 하나도 없으면 no-items 와 빈 컨텍스트, analyze 실패는 그대로 던진다", async () => {
  const none = fake({ analyze: [] });
  const { context, trace } = await planContext("q", { config: config(), ports: none.ports, now: none.now });
  assert.equal(context, "");
  assert.equal(trace.stop, "no-items");
  assert.deepEqual(none.log.builds, []);
  const broken = fake({ analyze: new Error("분석 실패") });
  await assert.rejects(planContext("q", { config: config(), ports: broken.ports }), /분석 실패/);
  await assert.rejects(planContext("q", { config: config({ mode: "classic" }), ports: none.ports }), /classic/);
});

test("reevaluate: 첫 답변이 통과하면 passed", async () => {
  const { ports, log, now } = fake({ analyze: ["a"], evaluations: [evalOf(90)] });
  const { trace } = await planContext("q", { config: config({ mode: "reevaluate" }), ports, now });
  assert.equal(trace.stop, "passed");
  assert.equal(trace.answer, "답:1");
  assert.equal(trace.rounds.length, 1);
  assert.equal(trace.rounds[0].evaluation?.pass, true);
  assert.equal(trace.rounds[0].contextChars, "## a\n\nctx:a".length);
  assert.deepEqual(log.answers, ["## a\n\nctx:a"]);
});

test("reevaluate: 부족 컨텍스트를 보강해 새 것만 build 하고(기존 재사용, provided 전달), 다시 평가해 통과", async () => {
  const { ports, log, now } = fake({
    analyze: ["a"],
    prereq: { a: ["p"], m: ["p", "n"] },
    // 점수는 넘지만 부족 개수가 maxMissing(0) 을 넘어 불통과.
    evaluations: [evalOf(95, ["m"]), evalOf(90)]
  });
  const { context, trace } = await planContext("q", { config: config({ mode: "reevaluate" }), ports, now });
  assert.equal(trace.stop, "passed");
  assert.equal(trace.rounds.length, 2);
  assert.equal(trace.rounds[0].evaluation?.pass, false);
  const m = trace.items.find((i) => i.name === "m");
  assert.ok(m);
  assert.equal(m.top, true);
  assert.equal(m.round, 1);
  assert.equal(m.level, 1);
  assert.deepEqual(m.needs.map((id) => trace.items.find((i) => i.id === id)?.name), ["p", "n"]);
  assert.deepEqual(trace.rounds[0].addedItemIds, [m.id, "i4"]);
  assert.deepEqual(log.builds, ["p", "a", "n", "m"], "기존 a · p 는 다시 만들지 않는다");
  assert.deepEqual(log.provided.m, [{ name: "p", context: "ctx:p" }, { name: "n", context: "ctx:n" }]);
  assert.deepEqual(trace.waves, [["i2"], ["i1"], ["i4"], ["i3"]]);
  assert.deepEqual(trace.levels.map((l) => l.level), [2, 3, 2, 3]);
  assert.equal(context, "## a\n\nctx:a\n\n## m\n\nctx:m");
  assert.ok(trace.rounds[1].contextChars > trace.rounds[0].contextChars);
  assert.equal(trace.answer, "답:2");
});

test("reevaluate: 기존 사전 아이템이 부족 항목과 같으면 재생성 없이 top 으로 승격한다", async () => {
  const { ports, log, now } = fake({ analyze: ["a"], prereq: { a: ["p"] }, evaluations: [evalOf(10, ["P"]), evalOf(90)] });
  const { context, trace } = await planContext("q", { config: config({ mode: "reevaluate" }), ports, now });
  assert.equal(trace.stop, "passed");
  assert.deepEqual(log.builds, ["p", "a"]);
  assert.deepEqual(trace.rounds[0].addedItemIds, []);
  assert.equal(context, "## a\n\nctx:a\n\n## p\n\nctx:p");
});

test("reevaluate: maxRounds 에 닿으면 max-rounds", async () => {
  const { ports, now } = fake({ analyze: ["a"], evaluations: [evalOf(10, ["b"]), evalOf(10, ["c"]), evalOf(10, ["d"])] });
  const { trace } = await planContext("q", { config: config({ mode: "reevaluate" }, { maxRounds: 1 }), ports, now });
  assert.equal(trace.stop, "max-rounds");
  assert.equal(trace.rounds.length, 2);
  assert.deepEqual(trace.items.map((i) => i.name), ["a", "b"]);
});

test("reevaluate: 불통과인데 부족 항목이 없으면 no-missing", async () => {
  const { ports, now } = fake({ analyze: ["a"], evaluations: [evalOf(10)] });
  const { trace } = await planContext("q", { config: config({ mode: "reevaluate" }), ports, now });
  assert.equal(trace.stop, "no-missing");
});

test("reevaluate: 부족 항목이 모두 컨텍스트가 있는 기존 top 이면 no-new-items", async () => {
  const same = fake({ analyze: ["a"], evaluations: [evalOf(10, ["A"])] });
  const r1 = await planContext("q", { config: config({ mode: "reevaluate" }), ports: same.ports, now: same.now });
  assert.equal(r1.trace.stop, "no-new-items");
});

test("reevaluate: 최초 계획이 maxItems 를 꽉 채워도 보강은 별도 예산으로 새 아이템과 그 사전 아이템을 만든다", async () => {
  const { ports, log, now } = fake({ analyze: ["a", "b", "c"], prereq: { m: ["p"] }, evaluations: [evalOf(10, ["m", "n"]), evalOf(90)] });
  const { context, trace } = await planContext("q", { config: config({ mode: "reevaluate", maxItems: 2 }), ports, now });
  assert.equal(trace.stop, "passed");
  assert.deepEqual(trace.items.map((i) => `${i.name}:${i.round}:${i.top ? "T" : "-"}`), ["a:0:T", "b:0:T", "m:1:T", "n:1:T", "p:1:-"]);
  assert.deepEqual(trace.rounds[0].addedItemIds, ["i3", "i4", "i5"]);
  assert.deepEqual(log.builds, ["a", "b", "n", "p", "m"]);
  assert.match(context, /## m\n\nctx:m\n\n## n\n\nctx:n$/);
});

test("reevaluate: 라운드 예산(시작 아이템 수 + maxNewItems×(1+maxNeedsPerItem))을 넘는 후보는 버리고, 예산은 라운드마다 새로 잡는다", async () => {
  assert.equal(roundItemBudget(16, { maxNeedsPerItem: 4, reevaluate: { maxRounds: 2, passScore: 80, maxMissing: 0, maxNewItems: 3 } }), 31);
  const { ports, now } = fake({
    analyze: ["a"],
    prereq: { m: ["x"], x: ["y"], k: ["z"] },
    evaluations: [evalOf(10, ["m", "k"]), evalOf(10, ["k"]), evalOf(90)]
  });
  // 예산 = 시작 아이템 수 + 1×(1+1). 1라운드: 1+2=3 → m(새 top, maxNewItems=1 이라 k 는 버림), x 까지. y 는 예산 초과로 버림.
  // 2라운드: 3+2=5 → k, z.
  const { trace } = await planContext("q", { config: config({ mode: "reevaluate", maxItems: 1, maxNeedsPerItem: 1 }, { maxNewItems: 1 }), ports, now });
  assert.equal(trace.stop, "passed");
  assert.deepEqual(trace.items.map((i) => `${i.name}:${i.round}`), ["a:0", "m:1", "x:1", "k:2", "z:2"]);
  assert.deepEqual(trace.rounds.map((r) => r.addedItemIds), [["i2", "i3"], ["i4", "i5"], []]);
  assert.deepEqual(trace.levels.filter((l) => l.created === 0 && l.candidates > 0).map((l) => l.level), [3], "1라운드 3단계의 y 가 예산에 걸렸다");
});

test("reevaluate: 한 라운드 보강은 maxNewItems 까지", async () => {
  const { ports, now } = fake({ analyze: ["a"], evaluations: [evalOf(10, ["b", "c", "d"]), evalOf(90)] });
  const { trace } = await planContext("q", { config: config({ mode: "reevaluate" }, { maxNewItems: 2 }), ports, now });
  assert.deepEqual(trace.items.map((i) => i.name), ["a", "b", "c"]);
});

test("reevaluate: 평가 실패는 evaluationError 와 evaluation-failed, 답변 실패는 answer.error 와 answer-failed 로 멈춘다", async () => {
  const ev = fake({ analyze: ["a"], evaluations: [new Error("평가 오류")] });
  const r1 = await planContext("q", { config: config({ mode: "reevaluate" }), ports: ev.ports, now: ev.now });
  assert.equal(r1.trace.stop, "evaluation-failed");
  assert.equal(r1.trace.rounds[0].evaluationError, "평가 오류");
  assert.equal(r1.trace.answer, "답:1");
  assert.equal(r1.context, "## a\n\nctx:a");

  const an = fake({ analyze: ["a"], answerError: true });
  const r2 = await planContext("q", { config: config({ mode: "reevaluate" }), ports: an.ports, now: an.now });
  assert.equal(r2.trace.stop, "answer-failed");
  assert.deepEqual(r2.trace.rounds[0].answer, { text: null, error: "답변 실패", ms: 1 });
  assert.equal(r2.trace.rounds[0].evaluation, null);
  assert.equal(r2.trace.answer, undefined);
});

test("진행 알림은 단계 순서대로 오고, 알림이 던져도 계획은 계속된다", async () => {
  const { ports, now } = fake({ analyze: ["a"], prereq: { a: ["p"] }, evaluations: [evalOf(10, ["m"]), evalOf(90)] });
  const stages: string[] = [];
  const { trace } = await planContext("q", {
    config: config({ mode: "reevaluate" }),
    ports,
    now,
    onProgress: (event) => { stages.push(event.stage); throw new Error("알림 실패"); }
  });
  assert.equal(trace.stop, "passed");
  assert.deepEqual(stages, ["analyze", "dependencies", "build", "build", "answer", "evaluate", "reinforce", "dependencies", "build", "answer", "evaluate", "done"]);
});

test("reevaluate: 다시 요구된 기존 top 이 error 면 pending 으로 되돌려 다시 build 한다(재빌드는 보강 라운드 안에서만)", async () => {
  const { ports, log, now } = fake({ analyze: ["a", "b"], failBuildTimes: { b: 1 }, evaluations: [evalOf(10, ["b"]), evalOf(90)] });
  const { context, trace } = await planContext("q", { config: config({ mode: "reevaluate" }), ports, now });
  assert.equal(trace.stop, "passed");
  assert.deepEqual(log.builds, ["a", "b", "b"]);
  const b = trace.items.find((i) => i.name === "b");
  assert.equal(b?.status, "built");
  assert.equal(b?.error, undefined);
  assert.deepEqual(trace.rounds[0].addedItemIds, [], "재빌드는 새 아이템이 아니다");
  assert.deepEqual(trace.waves, [["i1", "i2"], ["i2"]]);
  assert.equal(context, "## a\n\nctx:a\n\n## b\n\nctx:b");
});

test("reevaluate: error/empty 인 비top 사전 아이템이 요구되면 top 승격과 함께 재빌드한다", async () => {
  const { ports, log, now } = fake({ analyze: ["a"], prereq: { a: ["p"] }, failBuildTimes: { p: 1 }, evaluations: [evalOf(10, ["p"]), evalOf(90)] });
  const { context, trace } = await planContext("q", { config: config({ mode: "reevaluate" }), ports, now });
  assert.equal(trace.stop, "passed");
  assert.deepEqual(log.builds, ["p", "a", "p"]);
  assert.equal(trace.items[1].top, true);
  assert.equal(context, "## a\n\nctx:a\n\n## p\n\nctx:p");
});

test("reevaluate: 계속 실패하는 아이템의 재빌드는 maxRounds 번을 넘지 않는다", async () => {
  const always = Array.from({ length: 10 }, () => evalOf(10, ["b"]));
  for (const maxRounds of [0, 1, 3]) {
    const { ports, log, now } = fake({ analyze: ["a", "b"], failBuild: ["b"], evaluations: always });
    const { trace } = await planContext("q", { config: config({ mode: "reevaluate" }, { maxRounds }), ports, now });
    assert.equal(trace.stop, "max-rounds");
    assert.equal(log.builds.filter((n) => n === "b").length, 1 + maxRounds);
    assert.equal(trace.rounds.length, 1 + maxRounds);
  }
});

test("reevaluate: 이미 컨텍스트가 있는 top 만 다시 요구되면 재빌드하지 않고 no-new-items", async () => {
  const { ports, log, now } = fake({ analyze: ["a"], evaluations: [evalOf(10, ["a"])] });
  const { trace } = await planContext("q", { config: config({ mode: "reevaluate" }), ports, now });
  assert.equal(trace.stop, "no-new-items");
  assert.deepEqual(log.builds, ["a"]);
});

test("사전 요구 분석 실패는 trace.levels[].failed 에 남는다(첫 계획과 보강 라운드 모두)", async () => {
  const { ports, now } = fake({ analyze: ["a"], failPrereq: ["a", "m"], evaluations: [evalOf(10, ["m"]), evalOf(90)] });
  const { trace } = await planContext("q", { config: config({ mode: "reevaluate" }), ports, now });
  assert.equal(trace.stop, "passed");
  assert.deepEqual(trace.levels, [
    { level: 2, analyzed: 1, candidates: 0, created: 0, linked: 0, failed: [{ item: "i1", error: "a 분석 실패" }] },
    { level: 2, analyzed: 1, candidates: 0, created: 0, linked: 0, failed: [{ item: "i2", error: "m 분석 실패" }] }
  ]);
});
