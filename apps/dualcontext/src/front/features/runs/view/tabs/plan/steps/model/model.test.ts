import assert from "node:assert/strict";
import test from "node:test";
import type { PlanStep } from "dualcontext_domain/common";
import { groupSteps, memberNames, phaseMs, phaseShare } from "./index";

const base = { round: 0, ms: 10 };
const step = (seq: number, at: number, rest: Record<string, unknown>, over: { round?: number; ms?: number } = {}) =>
  ({ seq, at, ...base, ...over, ...rest }) as unknown as PlanStep;

test("같은 라운드 · 종류 · 단계 · 웨이브의 연속 기록을 한 묶음으로 묶고, 사전 요구 분석과 중복 정리는 같은 단계끼리 묶는다", () => {
  const phases = groupSteps([
    step(1, 20, { kind: "analyze", drafts: [] }),
    step(2, 25, { kind: "seed" }),
    step(3, 40, { kind: "prerequisites", level: 2, item: "i1", drafts: [] }),
    step(4, 42, { kind: "prerequisites", level: 2, item: "i2", drafts: [] }),
    step(5, 50, { kind: "dedupe", level: 2 }),
    step(6, 60, { kind: "prerequisites", level: 3, item: "i3", drafts: [] }),
    step(7, 80, { kind: "build", wave: 1, item: "i3" }),
    step(8, 90, { kind: "build", wave: 1, item: "i4" }),
    step(9, 120, { kind: "build", wave: 2, item: "i1" })
  ]);
  assert.deepEqual(phases.map((p) => [p.kind, p.level, p.wave, p.steps.length]), [
    ["analyze", undefined, undefined, 1], ["seed", undefined, undefined, 1],
    ["dependencies", 2, undefined, 3], ["dependencies", 3, undefined, 1],
    ["build", undefined, 1, 2], ["build", undefined, 2, 1]
  ]);
  assert.equal(new Set(phases.map((p) => p.key)).size, phases.length, "키는 유일하다");
});

test("라운드가 바뀌면 같은 종류여도 새 묶음이고, 순서가 어긋난 입력은 seq 로 세운다", () => {
  const phases = groupSteps([
    step(3, 90, { kind: "answer", chars: 1 }, { round: 1 }),
    step(1, 30, { kind: "answer", chars: 1 }),
    step(2, 60, { kind: "evaluate" })
  ]);
  assert.deepEqual(phases.map((p) => [p.round, p.kind]), [[0, "answer"], [0, "evaluate"], [1, "answer"]]);
});

test("묶음 시간은 병렬 기록의 합이 아니라 처음 시작부터 마지막 끝까지고, 비율은 0~1 로 자른다", () => {
  const [phase] = groupSteps([
    step(1, 100, { kind: "build", wave: 1, item: "i1" }, { ms: 90 }),
    step(2, 110, { kind: "build", wave: 1, item: "i2" }, { ms: 100 })
  ]);
  assert.equal(phase.startMs, 10);
  assert.equal(phaseMs(phase), 100, "90 + 100 이 아니다");
  assert.equal(phaseShare(phase, 200), 0.5);
  assert.equal(phaseShare(phase, 50), 1);
  assert.equal(phaseShare(phase, 0), 0);
});

test("at 보다 ms 가 큰 기록(시계 어긋남)도 시작이 음수가 되지 않는다. 빈 입력은 빈 목록", () => {
  const [phase] = groupSteps([step(1, 5, { kind: "answer", chars: 0 }, { ms: 50 })]);
  assert.equal(phase.startMs, 0);
  assert.deepEqual(groupSteps([]), []);
});

test("memberNames: 후보 번호를 이름으로 바꾸고 범위 밖 번호는 건너뛴다", () => {
  assert.deepEqual(memberNames([{ name: "a" }, { name: "b" }], [1, 0, 7]), ["b", "a"]);
});
