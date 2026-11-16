import type { ContextPlanConfig, PlanEvaluation, PlanRound, PlanStop } from "../../../common/index.js";
import { assembleContext } from "../assemble/index.js";
import { buildItems } from "../build/index.js";
import { expandDependencies, type LevelLog } from "../dependencies/index.js";
import type { PlanGraph } from "../graph/index.js";
import type { PlanPorts, PlanProgress } from "../ports.js";
import { seedTopItems } from "../seed/index.js";

/** 재평가 루프가 이어 쓰는 계획 상태. waves · levels 는 첫 계획 것에 이어 붙인다. */
export type RunState = {
  graph: PlanGraph;
  config: ContextPlanConfig;
  ports: PlanPorts;
  now: () => number;
  progress: (stage: PlanProgress["stage"], detail?: string) => Promise<void>;
  waves: string[][];
  levels: LevelLog[];
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * 보강 라운드 하나의 아이템 수 상한(전체 아이템 수 기준). config.maxItems 는 최초 계획에만 쓰고, 보강은 별도 예산을 쓴다:
 * 라운드 시작 시점 아이템 수 + maxNewItems × (1 + maxNeedsPerItem). 새 top 은 seed 의 maxCreate(maxNewItems)가 따로 막고,
 * 그 사전 아이템은 남은 예산 안에서 만든다. 누적 상한은 없다(바깥 한도는 maxRounds).
 * see docs/plan.md#reevaluate
 */
export function roundItemBudget(itemsAtStart: number, config: Pick<ContextPlanConfig, "maxNeedsPerItem" | "reevaluate">): number {
  return itemsAtStart + config.reevaluate.maxNewItems * (1 + config.maxNeedsPerItem);
}

/** 통과조건: score >= passScore && missing 개수 <= maxMissing. */
export function judge(evaluation: Omit<PlanEvaluation, "pass">, limits: ContextPlanConfig["reevaluate"]): PlanEvaluation {
  const missing = Array.isArray(evaluation?.missing) ? evaluation.missing : [];
  const score = Number.isFinite(evaluation?.score) ? evaluation.score : 0;
  return {
    score,
    missing,
    reason: typeof evaluation?.reason === "string" ? evaluation.reason : "",
    pass: score >= limits.passScore && missing.length <= limits.maxMissing
  };
}

/**
 * answer → evaluate → (불통과면) 부족 컨텍스트를 새 top 아이템으로 보강 → 새 것만 build → 재조립 → 반복.
 * answer 실패는 round.answer.error 를 남기고 stop=answer-failed, evaluate 실패는 evaluationError 와 stop=evaluation-failed.
 * 다시 요구된 기존 아이템이 error/empty 면 pending 으로 되돌려 새 아이템과 함께 다시 build 한다(보강 라운드 안에서만이므로 maxRounds 번을 넘지 않는다).
 * see docs/plan.md#reevaluate
 */
export async function reevaluateLoop(query: string, state: RunState): Promise<{ rounds: PlanRound[]; stop: PlanStop; answer?: string }> {
  const { graph, config, ports, now, progress } = state;
  const limits = config.reevaluate;
  const rounds: PlanRound[] = [];
  let lastAnswer: string | undefined;

  for (let round = 0; ; round += 1) {
    const context = assembleContext(graph.items);
    const record: PlanRound = { round, contextChars: context.length, answer: { text: null, error: null, ms: 0 }, evaluation: null, addedItemIds: [] };
    rounds.push(record);

    await progress("answer", `round ${round}`);
    const answerStarted = now();
    try {
      record.answer.text = await ports.answer(query, context);
      lastAnswer = record.answer.text;
    } catch (error) {
      record.answer.error = message(error);
    }
    record.answer.ms = now() - answerStarted;
    if (record.answer.text === null) return { rounds, stop: "answer-failed", answer: lastAnswer };

    await progress("evaluate", `round ${round}`);
    try {
      record.evaluation = judge(await ports.evaluate(query, context, record.answer.text), limits);
    } catch (error) {
      record.evaluationError = message(error);
      return { rounds, stop: "evaluation-failed", answer: lastAnswer };
    }

    const evaluation = record.evaluation;
    if (evaluation.pass) return { rounds, stop: "passed", answer: lastAnswer };
    if (round >= limits.maxRounds) return { rounds, stop: "max-rounds", answer: lastAnswer };
    if (evaluation.missing.length === 0) return { rounds, stop: "no-missing", answer: lastAnswer };

    await progress("reinforce", `round ${round + 1}: missing ${evaluation.missing.length}`);
    const drafts = evaluation.missing.map(({ name, description }) => ({ name, description }));
    // 보강 예산: config.maxItems 는 최초 계획의 상한이다. 라운드마다 시작 시점 아이템 수에서 새로 계산한다.
    const roundConfig = { ...config, maxItems: roundItemBudget(graph.items.length, config) };
    const seeded = await seedTopItems(query, drafts, graph, { round: round + 1, maxCreate: limits.maxNewItems }, roundConfig, ports);
    if (seeded.created.length === 0 && seeded.promoted.length === 0 && seeded.rebuild.length === 0) {
      return { rounds, stop: "no-new-items", answer: lastAnswer };
    }

    const toBuild: string[] = [];
    if (seeded.created.length > 0) {
      await progress("dependencies", `round ${round + 1}`);
      const expanded = await expandDependencies(query, graph, seeded.created, { round: round + 1 }, roundConfig, ports);
      state.levels.push(...expanded.levels);
      record.addedItemIds = [...seeded.created, ...expanded.created].map((item) => item.id);
      toBuild.push(...record.addedItemIds);
    }
    for (const item of seeded.rebuild) {
      item.status = "pending";
      item.context = "";
      item.pairs = [];
      delete item.error;
      delete item.ms;
      toBuild.push(item.id);
    }
    if (toBuild.length > 0) {
      const waves = await buildItems(query, graph, toBuild, ports, now, (wave, i) =>
        progress("build", `round ${round + 1} wave ${i + 1}: ${wave.join(",")}`)
      );
      state.waves.push(...waves);
    }
  }
}
