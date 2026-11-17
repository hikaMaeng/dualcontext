import type { PlanItem, PlanStep } from "dualcontext_domain/common";

/** 분해된 질의(top 아이템) 하나와 그것이 먼저 필요로 하는 컨텍스트. sharedBy = 그 컨텍스트를 직접 필요로 하는 아이템 수. */
export type DecomposeEntry = { item: PlanItem; needs: { item: PlanItem; sharedBy: number }[] };

/** 사전 컨텍스트 하나가 어떻게 생겼나: 직 · 간접으로 기대는 분해 질의들, 그리고 그 아이템으로 합쳐진 사전 요구 후보(후보를 낸 아이템 + 후보 이름). */
export type MergedNeed = { item: PlanItem; reachedBy: PlanItem[]; sources: { owner: PlanItem | undefined; ownerId: string; name: string }[] };

export type DecomposeMap = { entries: DecomposeEntry[]; merged: MergedNeed[] };

/**
 * 처음 계획(round 0)의 분해 질의 → 사전 컨텍스트 구조. 사전 요구 후보가 서로 같은 것으로 정리되면 사전 컨텍스트가 질의 수보다 훨씬 적어지는데,
 * 그 관계(어느 질의가 어떤 후보를 냈고 그 후보가 무엇으로 합쳐졌는가)를 dedupe 단계 기록에서 그대로 옮긴다. 추정하지 않는다: 기록에 없는 관계는 비운다.
 */
export function buildDecomposeMap(items: PlanItem[], steps: PlanStep[]): DecomposeMap {
  const byId = new Map(items.map((item) => [item.id, item]));
  const first = items.filter((item) => item.round === 0);
  const dependents = new Map<string, number>();
  for (const item of items) for (const need of item.needs) dependents.set(need, (dependents.get(need) ?? 0) + 1);
  const entries = first
    .filter((item) => item.top)
    .map((item) => ({
      item,
      needs: item.needs.flatMap((id) => {
        const need = byId.get(id);
        return need ? [{ item: need, sharedBy: dependents.get(id) ?? 0 }] : [];
      })
    }));
  const tops = entries.map((entry) => entry.item);
  const reaches = (top: PlanItem, target: string): boolean => {
    const seen = new Set<string>();
    const walk = (id: string): boolean => {
      if (id === target) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return (byId.get(id)?.needs ?? []).some(walk);
    };
    return top.needs.some(walk);
  };
  const dedupes = steps.filter((step): step is Extract<PlanStep, { kind: "dedupe" }> => step.kind === "dedupe" && step.round === 0);
  const merged = first
    .filter((item) => !item.top)
    .map((item) => ({
      item,
      reachedBy: tops.filter((top) => reaches(top, item.id)),
      sources: dedupes.flatMap((step) =>
        step.groups
          .filter((group) => group.target === item.id)
          .flatMap((group) => group.members.flatMap((member) => {
            const candidate = step.candidates[member];
            return candidate ? [{ owner: byId.get(candidate.owner), ownerId: candidate.owner, name: candidate.name }] : [];
          }))
      )
    }));
  return { entries, merged };
}
