import type { PlanItem, PlanTrace } from "dualcontext_domain/common";

/**
 * 의존성 트리의 한 줄.
 * - item    처음 나온 아이템. needs 를 children 으로 펼친다.
 * - repeat  이미 위에서 펼친 아이템(공유되는 사전 아이템 또는 순환). 다시 펼치지 않고 「위에 나옴」으로 접는다.
 * - unknown needs 가 가리키는데 items 에 없는 id. 숨기지 않고 id 그대로 보인다.
 * key 는 루트부터의 위치(순번:id)라 같은 아이템이 여러 곳에 나와도 유일하다.
 */
export type PlanTreeNode =
  | { kind: "item"; key: string; depth: number; item: PlanItem; children: PlanTreeNode[] }
  | { kind: "repeat"; key: string; depth: number; item: PlanItem }
  | { kind: "unknown"; key: string; depth: number; id: string };

/**
 * PlanItem 목록(DAG)을 들여쓰기 트리로 바꾼다. 루트는 top 아이템(목록 순서)이고, 각 노드의 needs 를 순서대로 펼친다.
 * 깊이 우선 전위 순회로 처음 만난 자리에서만 펼치고, 두 번째부터는 repeat 로 접는다(순환도 같은 규칙으로 끊긴다).
 * top 에서 닿지 않는 아이템(진행 중 기록 등)은 숨기지 않고 뒤에 루트로 덧붙인다.
 */
export function buildPlanTree(items: PlanItem[]): PlanTreeNode[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();

  const visit = (id: string, depth: number, key: string): PlanTreeNode => {
    const item = byId.get(id);
    if (!item) return { kind: "unknown", key, depth, id };
    if (seen.has(id)) return { kind: "repeat", key, depth, item };
    seen.add(id);
    const children = (item.needs ?? []).map((need, index) => visit(need, depth + 1, `${key}/${index}:${need}`));
    return { kind: "item", key, depth, item, children };
  };

  const roots: PlanTreeNode[] = [];
  const addRoot = (item: PlanItem) => roots.push(visit(item.id, 0, `${roots.length}:${item.id}`));
  items.filter((item) => item.top).forEach(addRoot);
  items.filter((item) => !seen.has(item.id)).forEach((item) => {
    // 앞의 고아 루트를 펼치며 이미 나온 아이템은 건너뛴다(루트 자리에 「위에 나옴」을 남기지 않는다).
    if (!seen.has(item.id)) addRoot(item);
  });
  return roots;
}

/** 아이템 id → 이름. 없는 id 는 id 그대로 보인다. */
export function itemName(items: PlanItem[], id: string): string {
  return items.find((item) => item.id === id)?.name ?? id;
}

/** 생성 웨이브를 이름으로 바꾼다(같은 묶음은 병렬로 만들어진 아이템). */
export function waveNames(plan: Pick<PlanTrace, "items" | "waves">): string[][] {
  const names = new Map(plan.items.map((item) => [item.id, item.name]));
  return (plan.waves ?? []).map((wave) => wave.map((id) => names.get(id) ?? id));
}

/** 계획의 단계 수: 아이템이 처음 발견된 단계(level)의 최댓값. 아이템이 없으면 0. */
export function planDepth(items: PlanItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.level), 0);
}
