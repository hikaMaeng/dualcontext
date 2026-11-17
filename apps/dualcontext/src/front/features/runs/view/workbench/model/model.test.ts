/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Answers, PlanItem, PlanRound, PlanStep, PlanTrace } from "dualcontext_domain/common";
import { buildRunGraph, neighborsOf, nodeOf, type GraphInput } from "./index";

const item = (id: string, name: string, over: Partial<PlanItem> = {}): PlanItem => ({
  id, name, description: "", level: 1, top: false, needs: [], round: 0, status: "built", context: `ctx ${name}`, pairs: [], ...over
});
const step = (seq: number, at: number, ms: number, rest: Record<string, unknown>) => ({ seq, round: 0, at, ms, ...rest }) as unknown as PlanStep;
const round = (n: number, over: Partial<PlanRound> = {}): PlanRound => ({
  round: n, contextChars: 10, answer: { text: `답 ${n}`, error: null, ms: 1000 }, evaluation: { score: 60, missing: [{ name: "m", description: "" }], reason: "", pass: false }, addedItemIds: [], ...over
});
const plan = (over: Partial<PlanTrace> = {}): PlanTrace => ({
  mode: "reevaluate",
  limits: { maxLevels: 3, maxNeedsPerItem: 4, maxItems: 16, maxProvidedChars: 3000, dedupe: "name", reevaluate: { maxRounds: 2, passScore: 80, maxMissing: 0, maxNewItems: 4 } },
  items: [], levels: [], waves: [], rounds: [], stop: "passed", ms: 1, ...over
});
const answers = (after: Partial<Answers["after"]> = {}): Answers => ({ before: { text: "전", error: null, ms: 100 }, after: { text: "후", error: null, ms: 200, ...after } });
const input = (over: Partial<GraphInput> = {}): GraphInput => ({ status: "ok", stage: "done", error: null, plan: null, answers: answers(), nodes: [], ...over });
const edgesOf = (graph: ReturnType<typeof buildRunGraph>, kind: string) => graph.edges.filter((edge) => edge.kind === kind).map((edge) => `${edge.from}>${edge.to}`).sort();

test("classic: 질의 → 증강 → 최종 답변, 질의 → 증강 전 답변. 분류 그래프는 없다", () => {
  const graph = buildRunGraph(input());
  assert.deepEqual(graph.nodes.map((node) => node.id), ["query", "classic", "answer:before", "answer:after"]);
  assert.deepEqual(edgesOf(graph, "flow"), ["classic>answer:after", "query>answer:before", "query>classic"]);
  assert.deepEqual(graph.groups, []);
  assert.equal(graph.finalId, "answer:after");
  assert.equal(nodeOf(graph, "answer:after")?.final, true);
});

test("classic 진행 중: 증강은 running, 답변은 아직 running 이고 노드 문서 유무가 표시된다", () => {
  const graph = buildRunGraph(input({ status: "running", stage: "augment", answers: null, nodes: ["classic"] }));
  assert.equal(nodeOf(graph, "classic")?.state, "running");
  assert.equal(nodeOf(graph, "classic")?.hasDoc, true);
  assert.equal(nodeOf(graph, "answer:after")?.state, "running");
  assert.equal(nodeOf(graph, "answer:before")?.hasDoc, false);
});

test("classic 이 증강 단계에서 실패하면 증강 노드가 error", () => {
  const graph = buildRunGraph(input({ status: "error", stage: "augment", error: "x", answers: null }));
  assert.equal(nodeOf(graph, "classic")?.state, "error");
});

const decomposed = (): GraphInput => input({
  plan: plan({
    mode: "decompose", stop: "mode-decompose",
    items: [
      item("i1", "환불 처리", { top: true, needs: ["i2", "i3"], ms: 500 }),
      item("i2", "환불 규정", { needs: ["i4"], level: 2 }),
      item("i3", "주문 상태", { level: 2 }),
      item("i4", "약관", { level: 3, status: "error" })
    ],
    steps: [
      step(1, 100, 100, { kind: "analyze", drafts: [] }),
      step(2, 200, 100, { kind: "seed" }),
      step(3, 900, 600, { kind: "build", wave: 1, item: "i3" }),
      step(4, 1000, 700, { kind: "assemble", items: ["i1"], chars: 5 })
    ]
  })
});

test("decompose: 질의 분해 → (시작 아이템) → needs 로 이어지고 1차 아이템 → 최종 답변, 분류 그래프 1 하나", () => {
  const graph = buildRunGraph(decomposed());
  assert.deepEqual(edgesOf(graph, "derive"), ["analyze>item:i3", "analyze>item:i4"]);
  assert.deepEqual(edgesOf(graph, "needs"), ["item:i2>item:i1", "item:i3>item:i1", "item:i4>item:i2"]);
  assert.deepEqual(edgesOf(graph, "feed"), ["item:i1>answer:after"]);
  assert.equal(graph.groups.length, 1);
  assert.deepEqual(graph.groups[0].reason, { type: "decompose" });
  assert.deepEqual(graph.groups[0].nodeIds, ["item:i1", "item:i2", "item:i3", "item:i4"]);
  assert.equal(graph.groups[0].ms, 800, "seed 시작(100)부터 build 끝(900)까지. 질의 분석 · 조립 기록은 세지 않는다");
  assert.equal(nodeOf(graph, "item:i4")?.state, "error");
  assert.equal(nodeOf(graph, "item:i1")?.group, 1);
  assert.equal(graph.finalId, "answer:after");
});

test("decompose 는 계획이 멈추고 답변 단계가 되기 전에는 최종 답변 노드를 만들지 않는다", () => {
  const running = decomposed();
  running.status = "running";
  running.stage = "augment";
  running.answers = null;
  running.plan = { ...(running.plan as PlanTrace), stop: null };
  const graph = buildRunGraph(running);
  assert.equal(nodeOf(graph, "answer:after"), undefined);
  assert.equal(graph.finalId, "query");
  assert.equal(nodeOf(graph, "item:i3")?.state, "done");
});

const reevaluated = (afterOver: Partial<Answers["after"]> = { fromPlan: true }): GraphInput => input({
  plan: plan({
    items: [
      item("i1", "A", { top: true }),
      item("i2", "M", { top: true, round: 1, needs: ["i3", "i1"] }),
      item("i3", "P", { round: 1 }),
      item("i4", "Q", { top: true, round: 2 })
    ],
    rounds: [
      round(0),
      round(1, { addedItemIds: ["i2", "i3"] }),
      round(2, { evaluation: { score: 95, missing: [], reason: "", pass: true } })
    ],
    steps: [
      step(1, 10, 10, { kind: "analyze", drafts: [] }),
      step(2, 20, 5, { kind: "assemble", items: ["i1"], chars: 1 }),
      { seq: 3, round: 1, at: 50, ms: 20, kind: "seed" } as unknown as PlanStep,
      { seq: 4, round: 1, at: 90, ms: 30, kind: "build", wave: 1, item: "i3" } as unknown as PlanStep,
      { seq: 5, round: 1, at: 95, ms: 1, kind: "assemble", items: ["i1", "i2"], chars: 2 } as unknown as PlanStep,
      { seq: 6, round: 2, at: 150, ms: 40, kind: "evaluate", score: 95, pass: true, missing: 0 } as unknown as PlanStep
    ]
  }),
  answers: answers(afterOver)
});

test("reevaluate: 라운드마다 답변 · 평가 노드, 평가 r → 보강 r+1 의 시작 아이템(derive), 그룹이 라운드별로 나뉜다", () => {
  const graph = buildRunGraph(reevaluated());
  assert.deepEqual(graph.nodes.filter((node) => node.kind === "answer" || node.kind === "evaluate").map((node) => node.id), ["answer:0", "evaluate:0", "answer:1", "evaluate:1", "answer:2", "evaluate:2"]);
  assert.deepEqual(edgesOf(graph, "derive"), ["analyze>item:i1", "evaluate:0>item:i3", "evaluate:1>item:i4"], "i2 는 같은 라운드의 i3 을 필요로 해 시작 아이템이 아니다");
  assert.deepEqual(graph.groups.map((group) => [group.n, group.reason, group.nodeIds]), [
    [1, { type: "decompose" }, ["item:i1"]],
    [2, { type: "evaluation", round: 0 }, ["item:i2", "item:i3"]],
    [3, { type: "evaluation", round: 1 }, ["item:i4"]]
  ]);
  assert.equal(graph.groups[1].ms, 60, "라운드 1: seed 시작 30 ~ build 끝 90(조립은 세지 않는다)");
  assert.equal(nodeOf(graph, "evaluate:0")?.score, 60);
  assert.equal(nodeOf(graph, "evaluate:0")?.pass, false);
  assert.equal(nodeOf(graph, "evaluate:2")?.pass, true);
});

test("reevaluate 간선: 조립에 든 아이템 → 그 라운드 답변. 단계 기록이 없는 라운드는 완성된 1차 아이템으로 대신한다", () => {
  const graph = buildRunGraph(reevaluated());
  assert.deepEqual(edgesOf(graph, "feed"), ["item:i1>answer:0", "item:i1>answer:1", "item:i1>answer:2", "item:i2>answer:1", "item:i2>answer:2", "item:i4>answer:2"]);
  assert.deepEqual(edgesOf(graph, "flow").filter((edge) => edge.startsWith("answer:")), ["answer:0>evaluate:0", "answer:1>evaluate:1", "answer:2>evaluate:2"]);
});

test("answers.after.fromPlan 이면 마지막 라운드 답변이 최종 답변이고 answer:after 노드는 없다", () => {
  const graph = buildRunGraph(reevaluated());
  assert.equal(nodeOf(graph, "answer:after"), undefined);
  assert.equal(nodeOf(graph, "answer:2")?.final, true);
  assert.equal(graph.finalId, "answer:2");
});

test("fromPlan 이 아니면 최종 답변 노드를 따로 두고 마지막 조립의 1차 아이템이 공급한다", () => {
  const graph = buildRunGraph(reevaluated({ fromPlan: false }));
  assert.equal(nodeOf(graph, "answer:after")?.final, true);
  assert.equal(nodeOf(graph, "answer:2")?.final, undefined);
  assert.deepEqual(edgesOf(graph, "feed").filter((edge) => edge.endsWith("answer:after")), ["item:i1>answer:after", "item:i2>answer:after"]);
});

test("reevaluate 는 answers.after 가 오기 전에는 최종 답변 노드를 만들지 않는다(fromPlan 으로 합쳐질 수 있다)", () => {
  const graph = buildRunGraph({ ...reevaluated(), status: "running", stage: "answering", answers: { before: { text: "전", error: null, ms: 1 } } });
  assert.equal(nodeOf(graph, "answer:after"), undefined);
  assert.equal(graph.finalId, "answer:2");
});

test("진행 중인 라운드: 답변이 아직이면 answer running 이고 평가 노드는 아직 없다", () => {
  const live = reevaluated();
  live.status = "running";
  live.stage = "augment";
  live.answers = null;
  live.plan = { ...(live.plan as PlanTrace), stop: null, rounds: [round(0, { answer: { text: null, error: null, ms: 0 }, evaluation: null })] };
  const graph = buildRunGraph(live);
  assert.equal(nodeOf(graph, "answer:0")?.state, "running");
  assert.equal(nodeOf(graph, "evaluate:0"), undefined);
});

test("답변 실패 · 평가 실패는 error 상태", () => {
  const failed = reevaluated();
  failed.plan = { ...(failed.plan as PlanTrace), rounds: [round(0, { answer: { text: null, error: "x", ms: 5 }, evaluation: null }), round(1, { evaluation: null, evaluationError: "bad" })] };
  const graph = buildRunGraph(failed);
  assert.equal(nodeOf(graph, "answer:0")?.state, "error");
  assert.equal(nodeOf(graph, "evaluate:0"), undefined, "답변이 없으니 평가 노드도 없다");
  assert.equal(nodeOf(graph, "evaluate:1")?.state, "error");
});

test("단계 기록(steps)이 없는 옛 계획 실행도 그려진다: 조립은 그 라운드까지의 완성된 1차 아이템, 그룹 시간은 null", () => {
  const old = reevaluated();
  old.plan = { ...(old.plan as PlanTrace) };
  delete old.plan.steps;
  const graph = buildRunGraph(old);
  assert.equal(nodeOf(graph, "analyze")?.state, "pending", "분석 기록이 없고 실행이 끝났으면 pending");
  assert.ok(graph.groups.every((group) => group.ms === null));
  assert.deepEqual(edgesOf(graph, "feed").filter((edge) => edge.endsWith("answer:0")), ["item:i1>answer:0"]);
  assert.deepEqual(edgesOf(graph, "feed").filter((edge) => edge.endsWith("answer:1")), ["item:i1>answer:1", "item:i2>answer:1"]);
});

test("가리키는 아이템이 없는 needs · 중복 간선은 만들지 않고, 증강 전 답변 상태가 반영된다", () => {
  const odd = input({ plan: plan({ mode: "decompose", stop: "mode-decompose", items: [item("i1", "A", { top: true, needs: ["ghost", "i2", "i2"] }), item("i2", "B")] }), answers: { before: { text: null, error: "x", ms: 3 } } });
  const graph = buildRunGraph(odd);
  assert.deepEqual(edgesOf(graph, "needs"), ["item:i2>item:i1"]);
  assert.equal(nodeOf(graph, "answer:before")?.state, "error");
  assert.equal(nodeOf(graph, "answer:after")?.state, "pending");
});

test("neighborsOf 는 들어오는 · 나가는 이웃을 돌려준다", () => {
  const graph = buildRunGraph(decomposed());
  const around = neighborsOf(graph, "item:i1");
  assert.deepEqual(around.inputs.map((node) => node.id).sort(), ["item:i2", "item:i3"]);
  assert.deepEqual(around.outputs.map((node) => node.id), ["answer:after"]);
  assert.deepEqual(neighborsOf(graph, "nope"), { inputs: [], outputs: [] });
});
