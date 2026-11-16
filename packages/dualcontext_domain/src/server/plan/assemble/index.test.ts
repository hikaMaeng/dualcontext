import assert from "node:assert/strict";
import test from "node:test";
import type { PlanItem } from "../../../common/index.js";
import { assembleContext } from "./index.js";

const item = (id: string, name: string, top: boolean, status: PlanItem["status"], context: string): PlanItem => ({
  id, name, description: "", level: 1, top, needs: [], round: 0, status, context, pairs: []
});

test("top 이고 built 이며 비지 않은 아이템만 `## 이름` 섹션으로 잇는다", () => {
  const context = assembleContext([
    item("i1", "환불", true, "built", "환불 본문\n"),
    item("i2", "사전", false, "built", "사전 본문"),
    item("i3", "실패", true, "error", ""),
    item("i4", "빈것", true, "built", "   "),
    item("i5", "세금", true, "built", "세금 본문")
  ]);
  assert.equal(context, "## 환불\n\n환불 본문\n\n## 세금\n\n세금 본문");
});

test("실을 것이 없으면 빈 문자열", () => {
  assert.equal(assembleContext([item("i1", "a", true, "empty", "")]), "");
  assert.equal(assembleContext([]), "");
});
