import assert from "node:assert/strict";
import test from "node:test";
import type { PlanItem, PlanStep } from "dualcontext_domain/common";
import { buildDecomposeMap } from "./model.js";

const item = (id: string, top: boolean, needs: string[], round = 0): PlanItem =>
  ({ id, name: `n-${id}`, description: "", level: top ? 1 : 2, top, needs, round, status: "built", context: "", pairs: [] }) as unknown as PlanItem;

test("분해 질의 여럿이 사전 컨텍스트 1개로 합쳐진 구조를 그대로 옮긴다", () => {
  const items = [item("i1", true, ["i6"]), item("i2", true, ["i6"]), item("i3", true, ["i6", "i2"]), item("i4", true, ["i2"]), item("i5", true, []), item("i6", false, [])];
  const steps = [
    {
      kind: "dedupe", round: 0, level: 2, method: "llm", seq: 1, at: 0, ms: 0,
      candidates: [{ name: "a", owner: "i1" }, { name: "b", owner: "i2" }, { name: "c", owner: "i3" }],
      groups: [{ members: [0, 1, 2], target: "i6", existing: false }]
    }
  ] as unknown as PlanStep[];
  const map = buildDecomposeMap(items, steps);
  assert.equal(map.entries.length, 5);
  assert.deepEqual(map.entries[2]?.needs.map((need) => need.item.id), ["i6", "i2"]);
  assert.equal(map.entries[0]?.needs[0]?.sharedBy, 3);
  assert.equal(map.merged.length, 1);
  assert.deepEqual(map.merged[0]?.reachedBy.map((top) => top.id), ["i1", "i2", "i3", "i4"]);
  assert.deepEqual(map.merged[0]?.sources.map((source) => `${source.ownerId}:${source.name}`), ["i1:a", "i2:b", "i3:c"]);
});

test("순환이 있어도 멈추고 보강 라운드 아이템은 제외한다", () => {
  const items = [item("i1", true, ["i2"]), item("i2", false, ["i1"]), item("i3", true, [], 1)];
  const map = buildDecomposeMap(items, []);
  assert.equal(map.entries.length, 1);
  assert.equal(map.merged[0]?.sources.length, 0);
});
