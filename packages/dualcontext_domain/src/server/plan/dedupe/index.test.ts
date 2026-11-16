import assert from "node:assert/strict";
import test from "node:test";
import { addItem, createGraph } from "../graph/index.js";
import { cleanDrafts, dedupeCandidates } from "./index.js";

const d = (name: string) => ({ name, description: `${name} 설명` });
const noLlm = { dedupe: async () => { throw new Error("부르면 안 된다"); } };

test("이름 정규화: 후보끼리 합치고 기존 아이템과 대조한다", async () => {
  const g = createGraph();
  addItem(g, d("환불 규정"), { level: 1, top: true, round: 0 });
  const result = await dedupeCandidates("q", [d("결제 수단"), d("환불규정"), d("결제-수단")], g, { dedupe: "name" }, noLlm);
  assert.equal(result.method, "name");
  assert.deepEqual(result.groups.map((x) => [x.members, x.existingId ?? null]), [[[0, 2], null], [[1], "i1"]]);
});

test("llm: 묶음과 기존 대조를 쓰고, 범위 밖 인덱스 · 없는 id 는 버린다", async () => {
  const g = createGraph();
  addItem(g, d("세금"), { level: 1, top: true, round: 0 });
  const ports = { dedupe: async () => ({ groups: [[0, 1, 9]], existing: { 2: "i1", 1: "i99" } as Record<number, string> }) };
  const result = await dedupeCandidates("q", [d("부가세"), d("VAT"), d("과세 기준")], g, { dedupe: "llm" }, ports);
  assert.equal(result.method, "llm");
  assert.deepEqual(result.groups.map((x) => [x.members, x.existingId ?? null]), [[[0, 1], null], [[2], "i1"]]);
});

test("llm 실패는 이름 정규화로 되돌아간다", async () => {
  const g = createGraph();
  const result = await dedupeCandidates("q", [d("A"), d("a")], g, { dedupe: "llm" }, { dedupe: async () => { throw new Error("x"); } });
  assert.equal(result.method, "llm-fallback-name");
  assert.deepEqual(result.groups.map((x) => x.members), [[0, 1]]);
});

test("빈 이름 초안은 버린다", () => {
  assert.deepEqual(cleanDrafts([{ name: "  ", description: "" }, { name: " a ", description: " b " }]), [{ name: "a", description: "b" }]);
});
