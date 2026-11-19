import assert from "node:assert/strict";
import test from "node:test";
import { RunAborted, type ContextPlanConfig } from "../../../common/index.js";
import { planContext, type PlanPorts } from "../index.js";

const config: ContextPlanConfig = {
  mode: "decompose", maxLevels: 2, maxNeedsPerItem: 2, maxItems: 10, maxProvidedChars: 4000, dedupe: "name",
  prompts: { analyze: "", prerequisites: "", dedupe: "", evaluate: "" },
  reevaluate: { maxRounds: 1, passScore: 80, maxMissing: 0, maxNewItems: 2 }
};

/** A 는 바로 만들어지고, B 는 신호가 abort 될 때까지 걸려 있다가 RunAborted 로 끝난다. */
function ports(controller: AbortController): PlanPorts {
  return {
    analyze: async () => [{ name: "A", description: "a" }, { name: "B", description: "b" }],
    prerequisites: async () => [],
    dedupe: async () => { throw new Error("name 모드"); },
    build: async (_q, item) => {
      if (item.name === "A") return { context: "ctx:A", pairs: [] };
      await new Promise<void>((resolve) => controller.signal.addEventListener("abort", () => resolve(), { once: true }));
      throw controller.signal.reason;
    },
    answer: async () => "답", evaluate: async () => ({ score: 100, reason: "", missing: [] })
  };
}

test("시한 만료(deadline): 그때까지 조립된 컨텍스트를 stop=deadline 부분 결과로 돌려준다", async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new RunAborted("deadline")), 20);
  const { context, trace } = await planContext("q", { config, ports: ports(controller), signal: controller.signal });
  assert.equal(trace.stop, "deadline");
  assert.match(context, /ctx:A/);
});

test("사용자 취소(cancelled): 부분 결과 없이 RunAborted 로 끝난다", async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new RunAborted("cancelled")), 20);
  await assert.rejects(planContext("q", { config, ports: ports(controller), signal: controller.signal }), (error: unknown) => error instanceof RunAborted && error.reason === "cancelled");
});

test("이미 abort 된 신호로 시작하면 모델을 한 번도 부르지 않는다", async () => {
  const controller = new AbortController();
  controller.abort(new RunAborted("cancelled"));
  let calls = 0;
  const counted: PlanPorts = { ...ports(controller), analyze: async () => { calls += 1; return []; } };
  await assert.rejects(planContext("q", { config, ports: counted, signal: controller.signal }), RunAborted);
  assert.equal(calls, 0);
});
