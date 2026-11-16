import type { PlanStop, PlanTrace } from "../../common/index.js";
import { assembleContext } from "./assemble/index.js";
import { buildItems } from "./build/index.js";
import { expandDependencies } from "./dependencies/index.js";
import { createGraph } from "./graph/index.js";
import type { PlanOptions, PlanProgress } from "./ports.js";
import { reevaluateLoop, type RunState } from "./reevaluate/index.js";
import { seedTopItems } from "./seed/index.js";

export type { ItemBuild, PlanOptions, PlanPorts, PlanProgress, Provided } from "./ports.js";

/**
 * 컨텍스트 계획기: 질의 분석 → 사전 의존성 단계 루프(DAG) → 종단점부터 웨이브 build → top 아이템 조립.
 * reevaluate 모드면 answer/evaluate 로 부족 컨텍스트를 보강하는 루프를 더 돈다.
 * analyze 가 던지면 그대로 던진다. build · answer · evaluate 실패는 trace 에 남기고 계속하거나 멈춘다.
 * see docs/plan.md
 */
export async function planContext(query: string, options: PlanOptions): Promise<{ context: string; trace: PlanTrace }> {
  const { config, ports } = options;
  if (config.mode === "classic") throw new Error("planContext 는 classic 모드를 처리하지 않는다(augmentQuery 를 쓴다)");
  const now = options.now ?? Date.now;
  const started = now();
  const progress = async (stage: PlanProgress["stage"], detail?: string) => {
    if (!options.onProgress) return;
    try {
      await options.onProgress(detail === undefined ? { stage } : { stage, detail });
    } catch {
      // 진행 알림 실패는 계획을 멈추지 않는다.
    }
  };
  const state: RunState = { graph: createGraph(), config, ports, now, progress, waves: [], levels: [] };
  const trace = (stop: PlanStop, extra: Partial<PlanTrace> = {}): PlanTrace => ({
    mode: config.mode as PlanTrace["mode"],
    limits: {
      maxLevels: config.maxLevels,
      maxNeedsPerItem: config.maxNeedsPerItem,
      maxItems: config.maxItems,
      maxProvidedChars: config.maxProvidedChars,
      dedupe: config.dedupe,
      reevaluate: { ...config.reevaluate }
    },
    items: state.graph.items,
    levels: state.levels,
    waves: state.waves,
    rounds: [],
    stop,
    ...extra,
    ms: now() - started
  });

  await progress("analyze");
  const drafts = await ports.analyze(query);
  const seeded = await seedTopItems(query, drafts, state.graph, { round: 0, maxCreate: config.maxItems }, config, ports);
  if (seeded.created.length === 0) {
    await progress("done", "no-items");
    return { context: "", trace: trace("no-items") };
  }

  await progress("dependencies");
  const expanded = await expandDependencies(query, state.graph, seeded.created, { round: 0 }, config, ports);
  state.levels.push(...expanded.levels);

  const waves = await buildItems(query, state.graph, state.graph.items.map((item) => item.id), ports, now, (wave, i) =>
    progress("build", `wave ${i + 1}: ${wave.join(",")}`)
  );
  state.waves.push(...waves);

  if (config.mode === "decompose") {
    await progress("done", "mode-decompose");
    return { context: assembleContext(state.graph.items), trace: trace("mode-decompose") };
  }

  const result = await reevaluateLoop(query, state);
  await progress("done", result.stop);
  return {
    context: assembleContext(state.graph.items),
    trace: trace(result.stop, { rounds: result.rounds, ...(result.answer !== undefined ? { answer: result.answer } : {}) })
  };
}
