import assert from "node:assert/strict";
import test from "node:test";
import { applyPlanOverride, defaultPlanConfig } from "../../../../plan/config/index.js";
import { defaultEffort, effortChoice, efforts } from "./index.js";

test("effort 4단과 기본값은 light", () => {
  assert.deepEqual([...efforts], ["light", "middle", "high", "xhigh"]);
  assert.equal(defaultEffort, "light");
});

test("effort → 모드: light 분해 없음(classic), middle 질의 분해(decompose), high · xhigh 평가 · 보강(reevaluate)", () => {
  assert.equal(effortChoice("light").mode, "classic");
  assert.equal(effortChoice("middle").mode, "decompose");
  assert.equal(effortChoice("high").mode, "reevaluate");
  assert.equal(effortChoice("xhigh").mode, "reevaluate");
});

test("리플렉션(답변 · 평가) 최대 횟수 = maxRounds + 1: high 2번 → 1, xhigh 4번 → 3. 다른 한도는 관리자 설정 그대로", () => {
  const stored = { ...defaultPlanConfig(), mode: "classic" as const };
  for (const [effort, reflections] of [["high", 2], ["xhigh", 4]] as const) {
    const choice = effortChoice(effort);
    const applied = applyPlanOverride(stored, choice.mode, choice.override);
    assert.equal(applied.reevaluate.maxRounds + 1, reflections);
    assert.equal(applied.reevaluate.passScore, stored.reevaluate.passScore);
    assert.equal(applied.maxItems, stored.maxItems);
  }
  assert.equal(effortChoice("light").override, undefined);
  assert.equal(effortChoice("middle").override, undefined);
});

test("관리자 저장 모드는 MCP 호출에 적용되지 않는다(light 는 저장이 reevaluate 여도 classic)", () => {
  const stored = { ...defaultPlanConfig(), mode: "reevaluate" as const };
  const choice = effortChoice("light");
  assert.equal(applyPlanOverride(stored, choice.mode, choice.override).mode, "classic");
});
