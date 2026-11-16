/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanItem } from "dualcontext_domain/common";
import { buildPlanTree, itemName, planDepth, waveNames, type PlanTreeNode } from "./index";

const item = (id: string, needs: string[], extra: Partial<PlanItem> = {}): PlanItem => ({
  id,
  name: `이름-${id}`,
  description: "",
  level: 1,
  top: false,
  needs,
  round: 0,
  status: "built",
  context: "",
  pairs: [],
  ...extra
});

/** 트리를 "깊이 종류 id" 줄로 펴서 비교한다. */
const lines = (nodes: PlanTreeNode[]): string[] =>
  nodes.flatMap((node) => {
    const id = node.kind === "unknown" ? node.id : node.item.id;
    const own = `${node.depth} ${node.kind} ${id}`;
    return node.kind === "item" ? [own, ...lines(node.children)] : [own];
  });

test("top 아이템이 루트이고 needs 를 순서대로 들여쓴다", () => {
  const tree = buildPlanTree([
    item("i1", ["i3", "i4"], { top: true }),
    item("i2", [], { top: true }),
    item("i3", [], { level: 2 }),
    item("i4", ["i5"], { level: 2 }),
    item("i5", [], { level: 3 })
  ]);
  assert.deepEqual(lines(tree), ["0 item i1", "1 item i3", "1 item i4", "2 item i5", "0 item i2"]);
});

test("공유되는 사전 아이템은 처음 자리에서만 펼치고 두 번째부터 repeat 로 접는다", () => {
  const tree = buildPlanTree([
    item("i1", ["i3"], { top: true }),
    item("i2", ["i3"], { top: true }),
    item("i3", ["i4"], { level: 2 }),
    item("i4", [], { level: 3 })
  ]);
  assert.deepEqual(lines(tree), ["0 item i1", "1 item i3", "2 item i4", "0 item i2", "1 repeat i3"]);
});

test("key 는 같은 아이템이 여러 곳에 나와도 유일하다", () => {
  const tree = buildPlanTree([item("i1", ["i3", "i3"], { top: true }), item("i2", ["i3"], { top: true }), item("i3", [])]);
  const keys: string[] = [];
  const walk = (nodes: PlanTreeNode[]) => nodes.forEach((node) => { keys.push(node.key); if (node.kind === "item") walk(node.children); });
  walk(tree);
  assert.equal(new Set(keys).size, keys.length);
});

test("순환은 repeat 로 끊긴다", () => {
  const tree = buildPlanTree([item("i1", ["i2"], { top: true }), item("i2", ["i1"])]);
  assert.deepEqual(lines(tree), ["0 item i1", "1 item i2", "2 repeat i1"]);
});

test("items 에 없는 id 는 unknown 으로 남긴다", () => {
  assert.deepEqual(lines(buildPlanTree([item("i1", ["i9"], { top: true })])), ["0 item i1", "1 unknown i9"]);
});

test("top 에서 닿지 않는 아이템은 뒤에 루트로 덧붙이고, 그 아래에서 이미 나온 것은 루트로 다시 세우지 않는다", () => {
  const tree = buildPlanTree([item("i1", [], { top: true }), item("i2", ["i3"]), item("i3", [])]);
  assert.deepEqual(lines(tree), ["0 item i1", "0 item i2", "1 item i3"]);
});

test("빈 계획은 빈 트리다", () => {
  assert.deepEqual(buildPlanTree([]), []);
});

test("waveNames · itemName 은 id 를 이름으로 바꾸고 없는 id 는 그대로 둔다", () => {
  const items = [item("i1", []), item("i2", [])];
  assert.deepEqual(waveNames({ items, waves: [["i2"], ["i1", "i7"]] }), [["이름-i2"], ["이름-i1", "i7"]]);
  assert.equal(itemName(items, "i1"), "이름-i1");
  assert.equal(itemName(items, "i8"), "i8");
});

test("planDepth 는 level 의 최댓값이고 아이템이 없으면 0 이다", () => {
  assert.equal(planDepth([item("i1", [], { level: 1 }), item("i2", [], { level: 3 })]), 3);
  assert.equal(planDepth([]), 0);
});
