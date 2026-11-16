import type { ItemDraft, PlanItem } from "../../../common/index.js";

/**
 * 계획 하나의 아이템 그래프. 간선은 PlanItem.needs(이 아이템 → 먼저 만들어져야 하는 아이템)다.
 * 키: 아이템 id(i1, i2 …, seq 로 부여). 범위 · 수명: planContext 호출 한 번. 상한: config.maxItems(호출자가 지킨다).
 * 지우는 쪽: 없음(호출이 끝나면 trace.items 로 넘어가고 버려진다).
 * see docs/plan.md#graph
 */
export type PlanGraph = { items: PlanItem[]; byId: Map<string, PlanItem>; seq: number };

export function createGraph(): PlanGraph {
  return { items: [], byId: new Map(), seq: 0 };
}

/** 구두점이지만 이름의 뜻을 가르는 문자(`C#`, `R&D`, `10%`, `@scope`, `a*`). 지우지 않는다. `+` 같은 기호(\p{S})는 원래 지우지 않는다. */
const meaningfulPunctuation = new Set(["#", "&", "%", "@", "*"]);

/**
 * 이름 정규화: 대소문자 · 공백 · 흔한 구두점(`.` `-` `_` `/` 괄호 · 따옴표 등 \p{P})만 무시한다. 같은 키면 같은 아이템으로 본다.
 * 기호(\p{S}: `+` 등)와 meaningfulPunctuation 은 보존한다 — `C++`, `C#`, `C` 가 서로 다른 키다.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, (ch) => (meaningfulPunctuation.has(ch) ? ch : ""));
}

export function findByName(graph: PlanGraph, name: string): PlanItem | undefined {
  const key = normalizeName(name);
  if (!key) return undefined;
  return graph.items.find((item) => normalizeName(item.name) === key);
}

export function addItem(graph: PlanGraph, draft: ItemDraft, at: { level: number; top: boolean; round: number }): PlanItem {
  graph.seq += 1;
  const item: PlanItem = {
    id: `i${graph.seq}`,
    name: draft.name,
    description: draft.description,
    level: at.level,
    top: at.top,
    needs: [],
    round: at.round,
    status: "pending",
    context: "",
    pairs: []
  };
  graph.items.push(item);
  graph.byId.set(item.id, item);
  return item;
}

/** start 에서 needs 를 따라 target 에 닿는가(start === target 이면 참). */
export function reaches(graph: PlanGraph, startId: string, targetId: string): boolean {
  const seen = new Set<string>();
  const stack = [startId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === targetId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of graph.byId.get(id)?.needs ?? []) stack.push(next);
  }
  return false;
}

/**
 * from 이 to 를 먼저 필요로 한다는 간선을 건다. 자기 자신 · 이미 있는 간선 · 순환(to 가 from 에 닿음)은 거부한다.
 * @returns 간선을 새로 걸었으면 true.
 */
export function addEdge(graph: PlanGraph, fromId: string, toId: string): boolean {
  const from = graph.byId.get(fromId);
  if (!from || !graph.byId.has(toId) || fromId === toId) return false;
  if (from.needs.includes(toId)) return false;
  if (reaches(graph, toId, fromId)) return false;
  from.needs.push(toId);
  return true;
}

/**
 * ids 부분집합의 위상 웨이브. 첫 웨이브는 부분집합 안에 의존이 없는 아이템(종단점)이고,
 * 부분집합 밖을 가리키는 needs 는 이미 만들어진 것으로 본다. 웨이브 안 순서는 아이템 생성 순서다.
 */
export function computeWaves(graph: PlanGraph, ids: string[]): string[][] {
  const subset = new Set(ids.filter((id) => graph.byId.has(id)));
  const done = new Set<string>();
  const waves: string[][] = [];
  let remaining = graph.items.filter((item) => subset.has(item.id));
  while (remaining.length > 0) {
    const wave = remaining.filter((item) => item.needs.every((need) => !subset.has(need) || done.has(need)));
    // addEdge 가 순환을 막으므로 비지 않는다. 방어적으로 남은 것을 한 웨이브로 내보낸다.
    const next = wave.length > 0 ? wave : remaining;
    waves.push(next.map((item) => item.id));
    for (const item of next) done.add(item.id);
    remaining = remaining.filter((item) => !done.has(item.id));
  }
  return waves;
}
