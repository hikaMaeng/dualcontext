import assert from "node:assert/strict";
import test from "node:test";
import type { ContextPlanConfig } from "../../../common/index.js";
import { addItem, createGraph } from "../graph/index.js";
import { expandDependencies } from "./index.js";

type Limits = Pick<ContextPlanConfig, "maxLevels" | "maxNeedsPerItem" | "maxItems" | "dedupe">;
const limits = (over: Partial<Limits> = {}): Limits => ({ maxLevels: 4, maxNeedsPerItem: 4, maxItems: 40, dedupe: "name", ...over });

/** 이름 → 사전 아이템 이름 목록. 호출된 아이템 이름을 기록한다. */
function prereqPorts(map: Record<string, string[]>) {
  const calls: string[] = [];
  return {
    calls,
    ports: {
      prerequisites: async (_q: string, item: { name: string }) => {
        calls.push(item.name);
        return (map[item.name] ?? []).map((name) => ({ name, description: `${name} 설명` }));
      },
      dedupe: async () => { throw new Error("name 모드에서는 부르지 않는다"); }
    }
  };
}

function seeded(...names: string[]) {
  const g = createGraph();
  const top = names.map((name) => addItem(g, { name, description: "" }, { level: 1, top: true, round: 0 }));
  return { g, top };
}

const shape = (g: ReturnType<typeof createGraph>) => g.items.map((i) => `${i.id}:${i.name}:L${i.level}:${i.top ? "T" : "-"}:[${i.needs.join(",")}]`);

test("3단계 의존: 단계마다 새 아이템이 다음 분석 대상이 되고 새 것이 없으면 끝난다", async () => {
  const { g, top } = seeded("환불 처리");
  const { ports, calls } = prereqPorts({ "환불 처리": ["환불 규정"], "환불 규정": ["약관"] });
  const result = await expandDependencies("q", g, top, { round: 0 }, limits(), ports);
  assert.deepEqual(shape(g), ["i1:환불 처리:L1:T:[i2]", "i2:환불 규정:L2:-:[i3]", "i3:약관:L3:-:[]"]);
  assert.deepEqual(calls, ["환불 처리", "환불 규정", "약관"]);
  assert.deepEqual(result.levels, [
    { level: 2, analyzed: 1, candidates: 1, created: 1, linked: 0 },
    { level: 3, analyzed: 1, candidates: 1, created: 1, linked: 0 },
    { level: 4, analyzed: 1, candidates: 0, created: 0, linked: 0 }
  ]);
});

test("공유 사전 아이템: 여러 아이템이 같은 사전 아이템을 내면 하나로 합치고 모두 간선을 건다", async () => {
  const { g, top } = seeded("환불", "교환", "약관");
  const { ports } = prereqPorts({ 환불: ["고객 등급", "주문 상태"], 교환: ["고객등급"], 약관: [] });
  const result = await expandDependencies("q", g, top, { round: 0 }, limits({ maxLevels: 2 }), ports);
  assert.deepEqual(shape(g), [
    "i1:환불:L1:T:[i4,i5]", "i2:교환:L1:T:[i4]", "i3:약관:L1:T:[]", "i4:고객 등급:L2:-:[]", "i5:주문 상태:L2:-:[]"
  ]);
  assert.deepEqual(result.levels, [{ level: 2, analyzed: 3, candidates: 3, created: 2, linked: 0 }]);
});

test("기존 아이템과 같으면 간선만 걸고(linked), 순환이 생기는 간선은 걸지 않는다", async () => {
  const { g, top } = seeded("A", "B");
  // A 는 B 가 필요(기존 연결), B 는 A 가 필요(순환 → 거부), B 는 C 가 필요(새로).
  const { ports } = prereqPorts({ A: ["B"], B: ["a", "C"] });
  const result = await expandDependencies("q", g, top, { round: 0 }, limits({ maxLevels: 2 }), ports);
  assert.deepEqual(shape(g), ["i1:A:L1:T:[i2]", "i2:B:L1:T:[i3]", "i3:C:L2:-:[]"]);
  assert.deepEqual(result.levels, [{ level: 2, analyzed: 2, candidates: 3, created: 1, linked: 1 }]);
});

test("maxLevels 상한: 그 단계까지만 분석하고, 1 이면 분석을 부르지 않는다", async () => {
  const map = { a: ["b"], b: ["c"], c: ["d"] };
  const two = seeded("a");
  const p2 = prereqPorts(map);
  await expandDependencies("q", two.g, two.top, { round: 0 }, limits({ maxLevels: 3 }), p2.ports);
  assert.deepEqual(two.g.items.map((i) => i.name), ["a", "b", "c"]);
  assert.deepEqual(p2.calls, ["a", "b"]);

  const one = seeded("a");
  const p1 = prereqPorts(map);
  const result = await expandDependencies("q", one.g, one.top, { round: 0 }, limits({ maxLevels: 1 }), p1.ports);
  assert.deepEqual(p1.calls, []);
  assert.deepEqual(result.levels, []);
});

test("maxItems 상한: 새 아이템은 만들지 않지만 기존 아이템 연결은 허용한다", async () => {
  const { g, top } = seeded("a", "b");
  const { ports } = prereqPorts({ a: ["b", "x", "y"] });
  const result = await expandDependencies("q", g, top, { round: 0 }, limits({ maxItems: 3 }), ports);
  assert.deepEqual(shape(g), ["i1:a:L1:T:[i2,i3]", "i2:b:L1:T:[]", "i3:x:L2:-:[]"]);
  assert.deepEqual(result.levels[0], { level: 2, analyzed: 2, candidates: 3, created: 1, linked: 1 });
});

test("maxNeedsPerItem 초과분은 잘라내고, 분석 실패는 사전 요구 없음으로 진행하며 그 단계 로그 failed 에 남긴다", async () => {
  const { g, top } = seeded("a", "z");
  const ports = {
    prerequisites: async (_q: string, item: { name: string }) => {
      if (item.name === "z") throw new Error("모델 오류");
      return ["p", "q", "r"].map((name) => ({ name, description: "" }));
    },
    dedupe: async () => ({ groups: [], existing: {} })
  };
  const result = await expandDependencies("q", g, top, { round: 0 }, limits({ maxLevels: 2, maxNeedsPerItem: 2 }), ports);
  assert.deepEqual(g.items.map((i) => i.name), ["a", "z", "p", "q"]);
  assert.deepEqual(result.levels, [{ level: 2, analyzed: 2, candidates: 2, created: 2, linked: 0, failed: [{ item: "i2", error: "모델 오류" }] }]);
});

test("dedupe=llm 이면 ports.dedupe 로 묶고 known 에 기존 아이템을 넘긴다", async () => {
  const { g, top } = seeded("부가세 신고");
  let existingSeen: string[] = [];
  const ports = {
    prerequisites: async () => [{ name: "VAT", description: "" }, { name: "부가가치세", description: "" }],
    dedupe: async (_q: string, _c: unknown, existing: { id: string }[]) => {
      existingSeen = existing.map((e) => e.id);
      return { groups: [[0, 1]], existing: {} };
    }
  };
  await expandDependencies("q", g, top, { round: 0 }, limits({ maxLevels: 2, dedupe: "llm" }), ports);
  assert.deepEqual(existingSeen, ["i1"]);
  assert.deepEqual(shape(g), ["i1:부가세 신고:L1:T:[i2]", "i2:VAT:L2:-:[]"]);
});
