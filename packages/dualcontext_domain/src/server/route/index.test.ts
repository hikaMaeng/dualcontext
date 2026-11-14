import assert from "node:assert/strict";
import test from "node:test";
import { cosine, parseIdArray, parseIdSelection, selectByEmbedding, rankByEmbedding, routeResearchersByKeyword, topKByEmbedding } from "./index.js";

test("코사인 유사도 상위 개수만 고르고, 차원이 다른 항목은 건너뛴다", () => {
  const picked = topKByEmbedding(
    [1, 0],
    [
      { item: "a", vector: [1, 0] },
      { item: "b", vector: [0, 1] },
      { item: "c", vector: [0.9, 0.1] },
      { item: "d", vector: [1, 0, 0] }
    ],
    2
  );
  assert.deepEqual(picked, ["a", "c"]);
  assert.equal(cosine([0, 0], [1, 1]), 0);
});

test("LLM 답에서 후보 id 만 순서대로 뽑고 중복과 범위 밖은 버린다", () => {
  assert.deepEqual(parseIdSelection("답: [3, 1, 3, 99]", [1, 2, 3], 2), [3, 1]);
  assert.deepEqual(parseIdSelection("없음", [1, 2], 2), []);
});

test("최소 유사도 미만은 상위 개수 안이어도 제외하고, 0 이면 거르지 않는다", () => {
  const items = [
    { item: "a", vector: [1, 0] },
    { item: "b", vector: [0.9, 0.436] },
    { item: "c", vector: [0.6, 0.8] }
  ];
  assert.deepEqual(topKByEmbedding([1, 0], items, 3, 0.8), ["a", "b"]);
  assert.deepEqual(topKByEmbedding([1, 0], items, 3, 0.99), ["a"]);
  assert.deepEqual(topKByEmbedding([0, 1], items, 3, 0.99), []);
  assert.deepEqual(topKByEmbedding([1, 0], items, 3), ["a", "b", "c"]);
});

test("임베딩 점수는 모든 후보에 매겨져 점수순으로 나온다", () => {
  const ranked = rankByEmbedding([1, 0], [{ item: "x", vector: [0, 1] }, { item: "y", vector: [1, 0] }, { item: "z", vector: [1, 0, 0] }]);
  assert.deepEqual(ranked.map((entry) => entry.item), ["y", "x"]);
});

test("키워드가 하나도 맞지 않으면 선택하지 않는다(임의 폴백 금지)", () => {
  const researchers = [{ id: 1, name: "a", description: "", keywords: ["환불"], enabled: true, type: "folder" as const, config: {}, procedureIds: [] }];
  assert.deepEqual(routeResearchersByKeyword("전혀 다른 질문", researchers, 3), { mode: "keyword-none", selected: [] });
  assert.equal(routeResearchersByKeyword("환불 문의", researchers, 3).selected.length, 1);
});

test("임베딩 단계 규칙: 최소 점수, 최고 점수 대비 마진, 상위 개수를 차례로 적용한다", () => {
  const ranked = [{ item: "a", score: 0.82 }, { item: "b", score: 0.79 }, { item: "c", score: 0.7 }, { item: "d", score: 0.5 }];
  assert.deepEqual(selectByEmbedding(ranked, { topK: 3, minScore: 0.67, margin: 1 }).map((entry) => entry.item), ["a", "b", "c"]);
  assert.deepEqual(selectByEmbedding(ranked, { topK: 3, minScore: 0.67, margin: 0.05 }).map((entry) => entry.item), ["a", "b"]);
  assert.deepEqual(selectByEmbedding(ranked, { topK: 1, minScore: 0, margin: 1 }).map((entry) => entry.item), ["a"]);
  assert.deepEqual(selectByEmbedding(ranked, { topK: 3, minScore: 0.9, margin: 1 }), []);
  assert.deepEqual(selectByEmbedding([], { topK: 3, minScore: 0, margin: 1 }), []);
});

test("LLM 답에서 마지막 배열을 id 로 읽고, 배열이 없으면 null, 빈 배열이면 「없음」이다", () => {
  assert.deepEqual(parseIdArray("예: [9] 이므로 답은 [3, 1, 3, 99]", [1, 2, 3], 5), [3, 1]);
  assert.deepEqual(parseIdArray("[3, 1, 2]", [1, 2, 3], 2), [3, 1]);
  assert.deepEqual(parseIdArray("[]", [1, 2], 2), []);
  assert.deepEqual(parseIdArray("<think>[1]</think>[2]", [1, 2], 2), [2]);
  assert.equal(parseIdArray("도움이 될 후보가 없다", [1, 2], 2), null);
});
