/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanItem } from "dualcontext_domain/common";
import { defaultOrientation, layoutPlanGraph, metrics, neighborsOf, verticalFrom } from "./index";

const item = (id: string, needs: string[], extra: Partial<PlanItem> = {}): PlanItem => ({
  id, name: id, description: "", level: 1, top: false, needs, round: 0, status: "built", context: "", pairs: [], ...extra
});
const colOf = (items: PlanItem[]) => Object.fromEntries(layoutPlanGraph(items).nodes.map((n) => [n.id, n.col]));

test("빈 입력은 빈 배치다", () => {
  assert.deepEqual(layoutPlanGraph([]), { nodes: [], edges: [], width: 0, height: 0, columns: 0 });
});

test("열은 깊이다: 종단점 0, 의존하는 쪽은 1 + max(사전 아이템 열)", () => {
  const cols = colOf([item("i1", ["i2", "i3"], { top: true }), item("i2", ["i4"]), item("i3", []), item("i4", [])]);
  assert.deepEqual(cols, { i1: 2, i2: 1, i3: 0, i4: 0 });
});

test("공유되는 사전 아이템은 노드 하나에 간선 둘이다", () => {
  const layout = layoutPlanGraph([item("a", ["s"], { top: true }), item("b", ["s"], { top: true }), item("s", [])]);
  assert.equal(layout.nodes.filter((n) => n.id === "s").length, 1);
  assert.deepEqual(layout.edges.map((e) => `${e.from}>${e.to}`).sort(), ["s>a", "s>b"]);
});

test("없는 id · 자기 참조 · 중복 간선은 간선에서 뺀다", () => {
  const layout = layoutPlanGraph([item("a", ["a", "ghost", "b", "b"], { top: true }), item("b", [])]);
  assert.deepEqual(layout.edges.map((e) => `${e.from}>${e.to}`), ["b>a"]);
});

test("순환이 들어와도 멈추고 모든 노드를 배치하며 열 순서를 거스르는 간선은 그리지 않는다", () => {
  const layout = layoutPlanGraph([item("a", ["b"]), item("b", ["c"]), item("c", ["a"])]);
  assert.equal(layout.nodes.length, 3);
  for (const edge of layout.edges) {
    const from = layout.nodes.find((n) => n.id === edge.from)!;
    const to = layout.nodes.find((n) => n.id === edge.to)!;
    assert.ok(from.col < to.col);
  }
});

test("같은 열의 노드는 겹치지 않고 열은 세로 가운데로 맞춘다", () => {
  const layout = layoutPlanGraph([item("t", ["a", "b", "c"], { top: true }), item("a", []), item("b", []), item("c", [])]);
  const left = layout.nodes.filter((n) => n.col === 0).sort((x, y) => x.y - y.y);
  for (let i = 1; i < left.length; i += 1) assert.ok(left[i].y >= left[i - 1].y + metrics.nodeH);
  assert.equal(layout.nodes.find((n) => n.id === "t")!.y, left[1].y);
  assert.equal(layout.width, metrics.pad * 2 + 2 * metrics.nodeW + metrics.colGap);
});

test("바리센터 정렬은 교차를 없앤다: 위쪽 소비자의 사전 아이템이 위에 온다", () => {
  const layout = layoutPlanGraph([item("a", ["y"], { top: true }), item("b", ["x"], { top: true }), item("x", []), item("y", [])]);
  const y = (id: string) => layout.nodes.find((n) => n.id === id)!.y;
  assert.equal(y("y") < y("x"), y("a") < y("b"));
});

test("큰 입력(300개 사슬 + 공유)도 열 수 · 노드 수가 맞고 좌표가 유한하다", () => {
  const items: PlanItem[] = [];
  for (let i = 0; i < 300; i += 1) items.push(item(`n${i}`, i === 0 ? [] : [`n${i - 1}`, ...(i > 5 ? ["n0"] : [])]));
  const layout = layoutPlanGraph(items);
  assert.equal(layout.nodes.length, 300);
  assert.equal(layout.columns, 300);
  assert.ok(layout.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
});

test("neighborsOf 는 사전 아이템과 의존하는 아이템을 돌려준다", () => {
  const items = [item("a", ["s", "ghost"]), item("b", ["s"]), item("s", [])];
  const near = neighborsOf(items, "s");
  assert.deepEqual(near.needs.map((n) => n.id), []);
  assert.deepEqual(near.dependents.map((n) => n.id), ["a", "b"]);
  assert.deepEqual(neighborsOf(items, "a").needs.map((n) => n.id), ["s"]);
});

test("세로 배치: 열은 위→아래 줄이 되고 같은 줄은 가로로 가운데 정렬되며 간선은 아래 가운데에서 위 가운데로 간다", () => {
  const items = [item("top", ["a", "b"], { top: true }), item("a", ["root"]), item("b", []), item("root", [])];
  const horizontal = layoutPlanGraph(items);
  const vertical = layoutPlanGraph(items, "vertical");
  assert.deepEqual(vertical.nodes.map((n) => [n.id, n.col]), horizontal.nodes.map((n) => [n.id, n.col]), "열(깊이)은 방향과 무관하다");
  const at = Object.fromEntries(vertical.nodes.map((n) => [n.id, n]));
  assert.ok(at.root.y < at.a.y && at.a.y < at.top.y, "먼저 만들어지는 쪽이 위");
  assert.equal(at.root.y, at.b.y, "같은 열은 같은 줄");
  assert.notEqual(at.root.x, at.b.x);
  assert.equal(at.top.x + at.top.w / 2, vertical.width / 2, "한 칸짜리 줄은 폭의 가운데");
  assert.equal(vertical.height, metrics.pad * 2 + 3 * metrics.nodeH + 2 * metrics.layerGap);
  const edge = vertical.edges.find((e) => e.from === "a" && e.to === "top");
  assert.ok(edge);
  assert.match(edge.path, new RegExp(`^M${at.a.x + at.a.w / 2},${at.a.y + at.a.h} `), "사전 아이템 아래 가운데에서 시작");
  assert.match(edge.path, new RegExp(`${at.top.x + at.top.w / 2},${at.top.y}$`), "의존하는 쪽 위 가운데에서 끝");
});

test("세로 배치도 겹치지 않고 빈 입력 · 순환 · 큰 입력을 견딘다", () => {
  assert.deepEqual(layoutPlanGraph([], "vertical"), { nodes: [], edges: [], width: 0, height: 0, columns: 0 });
  const cyc = layoutPlanGraph([item("a", ["b"], { top: true }), item("b", ["a"])], "vertical");
  assert.equal(cyc.nodes.length, 2);
  const wide = layoutPlanGraph([item("t", ["x1", "x2", "x3"], { top: true }), item("x1", []), item("x2", []), item("x3", [])], "vertical");
  const row = wide.nodes.filter((n) => n.col === 0).sort((a, b) => a.x - b.x);
  assert.equal(row.length, 3);
  for (let i = 1; i < row.length; i += 1) assert.ok(row[i].x >= row[i - 1].x + row[i - 1].w + metrics.siblingGap - 0.001, "같은 줄의 노드는 겹치지 않는다");
  const chain = Array.from({ length: 300 }, (_, i) => item(`c${i}`, i === 0 ? [] : [`c${i - 1}`], { top: i === 299 }));
  const big = layoutPlanGraph(chain, "vertical");
  assert.equal(big.nodes.length, 300);
  assert.ok(Number.isFinite(big.height) && Number.isFinite(big.width));
});

test("기본 방향: 열이 verticalFrom 이상이면 세로, 아니면 가로", () => {
  assert.equal(defaultOrientation({ columns: verticalFrom - 1 }), "horizontal");
  assert.equal(defaultOrientation({ columns: verticalFrom }), "vertical");
});
