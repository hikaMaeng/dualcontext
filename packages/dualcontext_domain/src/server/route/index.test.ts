import assert from "node:assert/strict";
import test from "node:test";
import { cosine, parseIdSelection, topKByEmbedding } from "./index.js";

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
