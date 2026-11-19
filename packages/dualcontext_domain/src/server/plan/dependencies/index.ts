import { isRunAborted, type ContextPlanConfig, type ItemDraft, type PlanItem, type PlanTrace } from "../../../common/index.js";
import { cleanDrafts, dedupeCandidates } from "../dedupe/index.js";
import { addEdge, addItem, type PlanGraph } from "../graph/index.js";
import type { PlanPorts } from "../ports.js";
import { settleAll } from "../settle/index.js";
import type { StepRecorder } from "../steps/index.js";

export type LevelLog = PlanTrace["levels"][number];

export type ExpandResult = { levels: LevelLog[]; created: PlanItem[] };

/**
 * 단계 루프: frontier(같은 단계 아이템들)마다 사전 컨텍스트를 분석하고(단계 안 병렬), 후보를 모아 중복을 정리한 뒤
 * 새 아이템을 만들거나 기존 아이템에 간선만 건다. 새 아이템이 다음 frontier 다. maxLevels 단계까지,
 * 새 아이템이 없으면 즉시 끝난다. maxLevels=1 이면 분석을 부르지 않는다.
 * prerequisites 실패는 그 아이템의 사전 요구가 없는 것으로 보고 그 단계 로그의 failed 에 { item: 아이템 id, error } 로 남긴다.
 * maxLevels 는 '분석 반복 횟수'다: 기존 아이템으로 간선을 걸어 DAG 경로가 maxLevels 보다 깊어지는 것은 허용한다.
 * rec 가 있으면 아이템별 사전 요구 분석(prerequisites)과 단계별 중복 정리(dedupe)를 기록한다.
 * see docs/plan.md#dependencies
 */
export async function expandDependencies(
  query: string,
  graph: PlanGraph,
  frontier: PlanItem[],
  at: { round: number },
  config: Pick<ContextPlanConfig, "maxLevels" | "maxNeedsPerItem" | "maxItems" | "dedupe">,
  ports: Pick<PlanPorts, "prerequisites" | "dedupe">,
  rec?: StepRecorder
): Promise<ExpandResult> {
  const result: ExpandResult = { levels: [], created: [] };
  let current = frontier;
  for (let level = 2; level <= config.maxLevels && current.length > 0; level += 1) {
    const failed: { item: string; error: string }[] = [];
    const known: ItemDraft[] = graph.items.map((item) => ({ name: item.name, description: item.description }));
    const analyses = await settleAll(
      current.map(async (item) => {
        const startedAt = rec?.elapsed() ?? 0;
        try {
          const drafts = cleanDrafts(await ports.prerequisites(query, { name: item.name, description: item.description }, known, { round: at.round, item: item.id, level })).slice(0, config.maxNeedsPerItem);
          rec?.add({ kind: "prerequisites", round: at.round, ms: rec.elapsed() - startedAt, level, item: item.id, drafts });
          return drafts;
        } catch (error) {
          if (isRunAborted(error)) throw error;
          const message = error instanceof Error ? error.message : String(error);
          failed.push({ item: item.id, error: message });
          rec?.add({ kind: "prerequisites", round: at.round, ms: rec.elapsed() - startedAt, level, item: item.id, drafts: [], error: message });
          return [];
        }
      })
    );

    const candidates: ItemDraft[] = [];
    const owners: string[] = [];
    analyses.forEach((drafts, i) => {
      for (const draft of drafts) {
        candidates.push(draft);
        owners.push(current[i].id);
      }
    });

    const dedupeStarted = rec?.elapsed() ?? 0;
    const { groups, method } = await dedupeCandidates(query, candidates, graph, config, ports, { round: at.round, level });
    const next: PlanItem[] = [];
    const groupLog: { members: number[]; target: string | null; existing: boolean }[] = [];
    let linked = 0;
    for (const group of groups) {
      let targetId = group.existingId;
      if (!targetId) {
        // 상한이면 새로 만들지 않는다(기존 아이템에 연결되는 후보는 위에서 이미 허용된다).
        if (graph.items.length >= config.maxItems) {
          groupLog.push({ members: group.members, target: null, existing: false });
          continue;
        }
        const created = addItem(graph, group.draft, { level, top: false, round: at.round });
        next.push(created);
        targetId = created.id;
      }
      groupLog.push({ members: group.members, target: targetId, existing: Boolean(group.existingId) });
      for (const member of group.members) {
        if (addEdge(graph, owners[member], targetId) && group.existingId) linked += 1;
      }
    }
    if (rec && candidates.length > 0) {
      rec.add({
        kind: "dedupe",
        round: at.round,
        ms: rec.elapsed() - dedupeStarted,
        level,
        method,
        candidates: candidates.map((draft, index) => ({ name: draft.name, owner: owners[index] })),
        groups: groupLog
      });
    }
    result.levels.push({ level, analyzed: current.length, candidates: candidates.length, created: next.length, linked, ...(failed.length > 0 ? { failed } : {}) });
    result.created.push(...next);
    current = next;
  }
  return result;
}
