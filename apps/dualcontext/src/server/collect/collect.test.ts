import assert from "node:assert/strict";
import test from "node:test";
import { resolveVolumeFolder } from "./folder/index.js";
import { assertIdentifier, reduceMrl } from "./pgvector/index.js";

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
