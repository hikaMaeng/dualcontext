import type { PlanStop, PlanTrace } from "../../common/index.js";
import { assembleContext } from "./assemble/index.js";
import { buildItems } from "./build/index.js";
import { expandDependencies } from "./dependencies/index.js";
import { cleanDrafts } from "./dedupe/index.js";
import { createGraph } from "./graph/index.js";
import type { PlanOptions, PlanProgress } from "./ports.js";
import { reevaluateLoop, type RunState } from "./reevaluate/index.js";
import { seedTopItems } from "./seed/index.js";
import { createRecorder } from "./steps/index.js";

export type { ItemBuild, PlanCallRef, PlanOptions, PlanPorts, PlanProgress, Provided } from "./ports.js";

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
  // 부분 trace: 아직 멈추지 않았으므로 stop=null 이고 rounds 는 루프가 채우는 state.rounds 다.
  const emit = () => options.onTrace?.(trace(null, { rounds: state.rounds }));
  const rec = createRecorder(now, started, emit);
  const state: RunState = { graph: createGraph(), config, ports, now, progress, waves: [], levels: [], rounds: [], rec };
  const trace = (stop: PlanStop | null, extra: Partial<PlanTrace> = {}): PlanTrace => ({
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
    rounds: state.rounds,
    steps: rec.steps,
    stop,
    ...extra,
    ms: now() - started
  });

  await progress("analyze");
  const analyzeStarted = rec.elapsed();
  let drafts: Awaited<ReturnType<typeof ports.analyze>>;
  try {
    drafts = await ports.analyze(query, { round: 0 });
  } catch (error) {
    // 질의 분석 실패는 그대로 던진다(실행 로그가 오류로 닫는다). 그 전에 부분 trace 에 남겨 어디서 멈췄는지 보이게 한다.
    rec.add({ kind: "analyze", round: 0, ms: rec.elapsed() - analyzeStarted, drafts: [], error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  rec.add({ kind: "analyze", round: 0, ms: rec.elapsed() - analyzeStarted, drafts: cleanDrafts(drafts) });
  const seeded = await seedTopItems(query, drafts, state.graph, { round: 0, maxCreate: config.maxItems }, config, ports, rec);
  if (seeded.created.length === 0) {
    await progress("done", "no-items");
    return { context: "", trace: trace("no-items") };
  }

  await progress("dependencies");
  const expanded = await expandDependencies(query, state.graph, seeded.created, { round: 0 }, config, ports, rec);
  state.levels.push(...expanded.levels);

  const waves = await buildItems(query, state.graph, state.graph.items.map((item) => item.id), ports, now, (wave, i) =>
    progress("build", `wave ${i + 1}: ${wave.join(",")}`),
    { rec, round: 0 }
  );
  state.waves.push(...waves);

  if (config.mode === "decompose") {
    rec.add({ kind: "assemble", round: 0, ms: 0, items: state.graph.items.filter((item) => item.top && item.status === "built").map((item) => item.id), chars: assembleContext(state.graph.items).length });
    await progress("done", "mode-decompose");
    return { context: assembleContext(state.graph.items), trace: trace("mode-decompose") };
  }

  const result = await reevaluateLoop(query, state);
  await progress("done", result.stop);
  return {
    context: assembleContext(state.graph.items),
    trace: trace(result.stop, { ...(result.answer !== undefined ? { answer: result.answer } : {}) })
  };
}
