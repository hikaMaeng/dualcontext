import type { ContextPlanConfig, ItemDraft } from "../../../common/index.js";
import { findByName, normalizeName, type PlanGraph } from "../graph/index.js";
import type { PlanPorts } from "../ports.js";

/** 중복 정리 결과의 묶음 하나. members 는 candidates 인덱스(오름차순), existingId 가 있으면 그 기존 아이템과 같다. */
export type CandidateGroup = { members: number[]; draft: ItemDraft; existingId?: string };

export type DedupeResult = { groups: CandidateGroup[]; method: "name" | "llm" | "llm-fallback-name" };

/** 이름이 빈 초안은 버리고 앞뒤 공백을 정리한다. */
export function cleanDrafts(drafts: ItemDraft[] | null | undefined): ItemDraft[] {
  if (!Array.isArray(drafts)) return [];
  return drafts
    .filter((d) => d && typeof d.name === "string" && d.name.trim() !== "")
    .map((d) => ({ name: d.name.trim(), description: typeof d.description === "string" ? d.description.trim() : "" }));
}

/**
 * 후보를 같은 것끼리 묶고 기존 아이템과 대조한다.
 * - 이름 정규화는 언제나 적용한다(같은 이름 아이템이 그래프에 두 개 생기지 않게).
 * - dedupe=llm 이면 ports.dedupe 의 묶음 · 기존 대조를 그 위에 합친다. 던지면 이름 정규화만 쓴다.
 * see docs/plan.md#dedupe
 */
export async function dedupeCandidates(
  query: string,
  candidates: ItemDraft[],
  graph: PlanGraph,
  config: Pick<ContextPlanConfig, "dedupe">,
  ports: Pick<PlanPorts, "dedupe">
): Promise<DedupeResult> {
  const n = candidates.length;
  if (n === 0) return { groups: [], method: config.dedupe };

  const parent = candidates.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const existing = new Map<number, string>();

  let method: DedupeResult["method"] = "name";
  if (config.dedupe === "llm") {
    try {
      const answer = await ports.dedupe(
        query,
        candidates,
        graph.items.map((item) => ({ id: item.id, name: item.name, description: item.description }))
      );
      const valid = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < n;
      for (const group of answer?.groups ?? []) {
        const members = Array.isArray(group) ? group.filter(valid) : [];
        for (const m of members.slice(1)) union(members[0], m);
      }
      for (const [key, id] of Object.entries(answer?.existing ?? {})) {
        const index = Number(key);
        if (valid(index) && typeof id === "string" && graph.byId.has(id)) existing.set(index, id);
      }
      method = "llm";
    } catch {
      method = "llm-fallback-name";
    }
  }

  // 이름 정규화: 후보끼리, 그리고 기존 아이템과.
  const firstByKey = new Map<string, number>();
  candidates.forEach((c, i) => {
    const key = normalizeName(c.name);
    const first = firstByKey.get(key);
    if (first === undefined) firstByKey.set(key, i);
    else union(first, i);
    if (!existing.has(i)) {
      const same = findByName(graph, c.name);
      if (same) existing.set(i, same.id);
    }
  });

  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    byRoot.set(root, [...(byRoot.get(root) ?? []), i]);
  }
  const groups: CandidateGroup[] = [...byRoot.values()]
    .sort((a, b) => a[0] - b[0])
    .map((members) => {
      const existingId = members.map((m) => existing.get(m)).find((id) => id !== undefined);
      return { members, draft: candidates[members[0]], ...(existingId ? { existingId } : {}) };
    });
  return { groups, method };
}
