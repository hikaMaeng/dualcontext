import assert from "node:assert/strict";
import test from "node:test";
import { resolveVolumeFolder } from "./folder/index.js";
import { assertIdentifier, reduceMrl, toMaterials } from "./pgvector/index.js";
import { excerpt } from "./pgvector/excerpt.js";

test("폴더 조사원은 볼륨 안의 경로만 허용하고 볼륨 밖과 pgdata 는 거부한다", () => {
  assert.equal(resolveVolumeFolder("/data", "manuals/ko"), "/data/manuals/ko");
  assert.throws(() => resolveVolumeFolder("/data", "../etc"), /inside the volume/);
  assert.throws(() => resolveVolumeFolder("/data", "/etc"), /inside the volume/);
  assert.throws(() => resolveVolumeFolder("/data", "."), /inside the volume/);
  assert.throws(() => resolveVolumeFolder("/data", "pgdata/base"), /pgdata/);
  assert.throws(() => resolveVolumeFolder("/data", "  "), /empty/);
});

test("MRL 축소는 앞 차원을 자르고 길이 1로 다시 정규화한다", () => {
  const reduced = reduceMrl([3, 4, 12, 0], 2);
  assert.deepEqual(reduced, [0.6, 0.8]);
  assert.equal(Math.round(Math.hypot(...reduceMrl([1, 2, 3, 4, 5], 3)) * 1e6) / 1e6, 1);
});

test("테이블/컬럼 이름은 식별자 형태만 SQL 에 들어간다", () => {
  assert.equal(assertIdentifier("ds_legal_terms", "table"), "ds_legal_terms");
  assert.throws(() => assertIdentifier('x"; drop table y; --', "table"), /must match/);
  assert.throws(() => assertIdentifier(undefined, "table"), /must match/);
});

test("본문은 한도 안이면 그대로, 넘으면 문장 경계에서 자르고 생략을 표시한다", () => {
  assert.equal(excerpt("짧은 글.", 100), "짧은 글.");
  const text = "첫 문장이다. 둘째 문장이다. 셋째 문장은 한도를 넘어서 중간에서 끊긴다";
  assert.equal(excerpt(text, 20), "첫 문장이다. 둘째 문장이다. …(이하 생략)");
  // 문장 끝이 한도의 60% 앞에만 있으면 한도에서 자른다.
  assert.equal(excerpt(text, 30), "첫 문장이다. 둘째 문장이다. 셋째 문장은 한도를 넘어 …(이하 생략)");
  assert.equal(excerpt("가".repeat(50), 20), `${"가".repeat(20)} …(이하 생략)`);
});

test("자료 단위 관련도 기준 미달 행은 버리고 점수를 붙인다", () => {
  const rows = [
    { title: "관련", text: "본문", score: 0.7812 },
    { title: "무관", text: "본문", score: 0.6463 },
    { title: "경계", text: "본문", score: 0.72 }
  ];
  assert.deepEqual(toMaterials(rows, 100, 0.72).map((m) => [m.title, m.score]), [["관련", 0.7812], ["경계", 0.72]]);
  assert.equal(toMaterials(rows, 100, 0).length, 3);
  // pg 는 numeric 을 문자열로 돌려줄 수 있다.
  assert.equal(toMaterials([{ title: "a", text: "b", score: "0.8" as unknown as number }], 100, 0.72)[0]?.score, 0.8);
});
