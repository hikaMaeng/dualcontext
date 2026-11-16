import assert from "node:assert/strict";
import test from "node:test";
import { addEdge, addItem, computeWaves, createGraph, findByName, normalizeName, reaches } from "./index.js";

const at = { level: 1, top: true, round: 0 };

test("이름 정규화는 대소문자 · 공백 · 구두점을 무시한다", () => {
  assert.equal(normalizeName("  Refund Policy! "), normalizeName("refund-policy"));
  assert.equal(normalizeName("환불 규정(2024)"), normalizeName("환불규정 2024"));
  assert.notEqual(normalizeName("환불 규정"), normalizeName("환불 절차"));
});

test("이름 정규화는 뜻을 가르는 + # 등은 보존한다: C++ · C# · C 는 서로 다른 키다", () => {
  const keys = ["C++", "C#", "C", "c", "R&D", "RD"].map(normalizeName);
  assert.deepEqual(keys, ["c++", "c#", "c", "c", "r&d", "rd"]);
  assert.equal(normalizeName(" c# "), normalizeName("C#"));
  assert.equal(normalizeName("node.js"), normalizeName("Node-JS"));
  assert.equal(normalizeName("snake_case"), normalizeName("snake case"));
  const g = createGraph();
  addItem(g, { name: "C++", description: "" }, at);
  assert.equal(findByName(g, "C#"), undefined);
  assert.equal(findByName(g, "c ++")?.id, "i1");
});

test("id 는 i1, i2 … 로 부여되고 이름으로 찾는다", () => {
  const g = createGraph();
  const a = addItem(g, { name: "환불 규정", description: "" }, at);
  const b = addItem(g, { name: "결제 수단", description: "" }, at);
  assert.deepEqual([a.id, b.id], ["i1", "i2"]);
  assert.equal(findByName(g, "환불-규정")?.id, "i1");
  assert.equal(findByName(g, "없는 것"), undefined);
  assert.equal(a.status, "pending");
});

test("간선: 자기 자신 · 중복 · 순환은 거부한다", () => {
  const g = createGraph();
  const [a, b, c] = ["a", "b", "c"].map((name) => addItem(g, { name, description: "" }, at));
  assert.equal(addEdge(g, a.id, a.id), false);
  assert.equal(addEdge(g, a.id, b.id), true);
  assert.equal(addEdge(g, a.id, b.id), false);
  assert.equal(addEdge(g, b.id, c.id), true);
  assert.equal(addEdge(g, c.id, a.id), false, "c→a 는 a→b→c 와 순환");
  assert.deepEqual(a.needs, [b.id]);
  assert.equal(reaches(g, a.id, c.id), true);
  assert.equal(reaches(g, c.id, a.id), false);
});

test("웨이브: 종단점부터, 공유 사전 아이템은 한 번만, 부분집합 밖 의존은 이미 된 것으로 본다", () => {
  const g = createGraph();
  const [a, b, c, d] = ["a", "b", "c", "d"].map((name) => addItem(g, { name, description: "" }, at));
  addEdge(g, a.id, c.id);
  addEdge(g, b.id, c.id);
  addEdge(g, c.id, d.id);
  assert.deepEqual(computeWaves(g, [a.id, b.id, c.id, d.id]), [["i4"], ["i3"], ["i1", "i2"]]);
  assert.deepEqual(computeWaves(g, [a.id, b.id]), [["i1", "i2"]]);
  assert.deepEqual(computeWaves(g, []), []);
});
