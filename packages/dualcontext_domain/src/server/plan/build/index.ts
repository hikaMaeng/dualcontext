import type { PlanItem } from "../../../common/index.js";
import { computeWaves, type PlanGraph } from "../graph/index.js";
import type { PlanPorts, Provided } from "../ports.js";

/** 아이템이 needs 로 가리키는 사전 아이템 중 컨텍스트가 있는 것만 provided 로 건넨다(needs 순서). */
export function providedFor(graph: PlanGraph, item: PlanItem): Provided[] {
  return item.needs
    .map((id) => graph.byId.get(id))
    .filter((need): need is PlanItem => !!need && need.status === "built" && need.context.trim() !== "")
    .map((need) => ({ name: need.name, context: need.context }));
}

/**
 * ids 아이템들을 위상 웨이브 순서로 만든다(같은 웨이브는 병렬). 실패는 그 아이템만 status=error 로 남기고,
 * 그 아이템에 의존하는 쪽은 그 컨텍스트 없이 진행한다.
 * @returns 실제 실행한 웨이브(trace.waves 에 이어 붙인다).
 * see docs/plan.md#build
 */
export async function buildItems(
  query: string,
  graph: PlanGraph,
  ids: string[],
  ports: Pick<PlanPorts, "build">,
  now: () => number,
  onWave?: (wave: string[], index: number) => Promise<void>
): Promise<string[][]> {
  const waves = computeWaves(graph, ids);
  for (const [index, wave] of waves.entries()) {
    if (onWave) await onWave(wave, index);
    await Promise.all(
      wave.map(async (id) => {
        const item = graph.byId.get(id) as PlanItem;
        const started = now();
        try {
          const built = await ports.build(query, { name: item.name, description: item.description }, providedFor(graph, item));
          item.context = typeof built?.context === "string" ? built.context : "";
          item.pairs = Array.isArray(built?.pairs) ? built.pairs : [];
          item.status = item.context.trim() === "" ? "empty" : "built";
        } catch (error) {
          item.status = "error";
          item.context = "";
          item.error = error instanceof Error ? error.message : String(error);
        }
        item.ms = now() - started;
      })
    );
  }
  return waves;
}
