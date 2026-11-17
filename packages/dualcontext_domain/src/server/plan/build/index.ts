import type { PlanItem } from "../../../common/index.js";
import { computeWaves, type PlanGraph } from "../graph/index.js";
import type { PlanPorts, Provided } from "../ports.js";
import type { StepRecorder } from "../steps/index.js";

/** 아이템이 needs 로 가리키는 사전 아이템 중 컨텍스트가 있는 것(needs 순서). */
export function providedItems(graph: PlanGraph, item: PlanItem): PlanItem[] {
  return item.needs.map((id) => graph.byId.get(id)).filter((need): need is PlanItem => !!need && need.status === "built" && need.context.trim() !== "");
}

/** 사전 아이템 중 컨텍스트가 있는 것만 provided 로 건넨다(needs 순서). */
export function providedFor(graph: PlanGraph, item: PlanItem): Provided[] {
  return providedItems(graph, item).map((need) => ({ name: need.name, context: need.context }));
}

/**
 * ids 아이템들을 위상 웨이브 순서로 만든다(같은 웨이브는 병렬). 실패는 그 아이템만 status=error 로 남기고,
 * 그 아이템에 의존하는 쪽은 그 컨텍스트 없이 진행한다.
 * @returns 실제 실행한 웨이브(trace.waves 에 이어 붙인다).
 * record 가 있으면 아이템마다 build 단계(웨이브 번호 · 건넨 사전 컨텍스트 · 상태 · 길이)를 기록한다. round 는 기록에 붙는 라운드 번호다.
 * see docs/plan.md#build
 */
export async function buildItems(
  query: string,
  graph: PlanGraph,
  ids: string[],
  ports: Pick<PlanPorts, "build">,
  now: () => number,
  onWave?: (wave: string[], index: number) => Promise<void>,
  record?: { rec: StepRecorder; round: number }
): Promise<string[][]> {
  const waves = computeWaves(graph, ids);
  for (const [index, wave] of waves.entries()) {
    if (onWave) await onWave(wave, index);
    await Promise.all(
      wave.map(async (id) => {
        const item = graph.byId.get(id) as PlanItem;
        const started = now();
        const provided = providedItems(graph, item);
        try {
          const built = await ports.build(query, { name: item.name, description: item.description }, providedFor(graph, item), { round: record?.round ?? 0, item: item.id, provided: providedItems(graph, item).map((need) => need.id) });
          item.context = typeof built?.context === "string" ? built.context : "";
          item.pairs = Array.isArray(built?.pairs) ? built.pairs : [];
          item.status = item.context.trim() === "" ? "empty" : "built";
        } catch (error) {
          item.status = "error";
          item.context = "";
          item.error = error instanceof Error ? error.message : String(error);
        }
        item.ms = now() - started;
        record?.rec.add({
          kind: "build",
          round: record.round,
          ms: item.ms,
          wave: index + 1,
          item: item.id,
          status: item.status,
          provided: provided.map((need) => ({ item: need.id, chars: need.context.length })),
          contextChars: item.context.length,
          ...(item.error !== undefined ? { error: item.error } : {})
        });
      })
    );
  }
  return waves;
}
