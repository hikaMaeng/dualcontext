import type { ContextPlanConfig, ItemDraft, PlanItem } from "../../../common/index.js";
import { cleanDrafts, dedupeCandidates } from "../dedupe/index.js";
import { addItem, type PlanGraph } from "../graph/index.js";
import type { PlanPorts } from "../ports.js";

export type SeedResult = {
  /** 새로 만든 top 아이템. */
  created: PlanItem[];
  /** 기존 비top 아이템과 같아 top 으로 올린 것. built 면 재생성 없이 쓰고, error/empty 면 rebuild 에도 들어간다. */
  promoted: PlanItem[];
  /** 다시 요구됐는데 컨텍스트가 없는(status error/empty) 기존 아이템. 호출자가 pending 으로 되돌려 다시 build 한다. */
  rebuild: PlanItem[];
  /** 이미 컨텍스트가 있는 top 아이템과 같거나 상한에 걸려 버린 후보 수. */
  dropped: number;
};

/**
 * top 아이템 후보(질의 분석 결과 또는 평가가 요구한 부족 컨텍스트)를 그래프에 넣는다.
 * 중복은 합치고, 기존 아이템과 같으면 새로 만들지 않는다(비top 이면 top 으로 승격).
 * 같은 기존 아이템이 status error/empty 면 rebuild 로 돌려준다(첫 계획에서는 기존 아이템이 없어 비어 있다).
 * 새 아이템은 maxCreate 개와 config.maxItems 전체 상한을 넘지 않는다.
 * see docs/plan.md#seed
 */
export async function seedTopItems(
  query: string,
  drafts: ItemDraft[],
  graph: PlanGraph,
  at: { round: number; maxCreate: number },
  config: Pick<ContextPlanConfig, "dedupe" | "maxItems">,
  ports: Pick<PlanPorts, "dedupe">
): Promise<SeedResult> {
  const candidates = cleanDrafts(drafts);
  const { groups } = await dedupeCandidates(query, candidates, graph, config, ports);
  const result: SeedResult = { created: [], promoted: [], rebuild: [], dropped: 0 };
  for (const group of groups) {
    if (group.existingId) {
      const item = graph.byId.get(group.existingId) as PlanItem;
      const lacking = item.status === "error" || item.status === "empty";
      if (!item.top) {
        item.top = true;
        result.promoted.push(item);
      } else if (!lacking) result.dropped += 1;
      if (lacking && !result.rebuild.includes(item)) result.rebuild.push(item);
      continue;
    }
    if (result.created.length >= at.maxCreate || graph.items.length >= config.maxItems) {
      result.dropped += 1;
      continue;
    }
    result.created.push(addItem(graph, group.draft, { level: 1, top: true, round: at.round }));
  }
  return result;
}
