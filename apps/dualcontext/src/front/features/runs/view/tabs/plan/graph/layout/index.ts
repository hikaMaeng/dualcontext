import type { PlanItem } from "dualcontext_domain/common";

export type GraphNode = { id: string; col: number; x: number; y: number; w: number; h: number };
export type GraphEdge = {
  /** 사전 아이템(먼저 만들어지는 쪽). */
  from: string;
  /** 사전 아이템을 필요로 하는 쪽. */
  to: string;
  /** 사전 아이템의 오른쪽 가운데에서 의존하는 쪽의 왼쪽 가운데로 가는 SVG 3차 곡선 경로. */
  path: string;
};
export type GraphLayout = { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number; columns: number };

/**
 * 배치 방향. horizontal = 왼쪽(먼저 만들어짐)→오른쪽(최종), vertical = 위(먼저 만들어짐)→아래(최종).
 * 깊은 의존 사슬은 가로로 길어져 좁은 화면에서 스크롤이 길다: 그때는 vertical 이 폭을 아끼고 높이가 늘어난다.
 */
export type GraphOrientation = "horizontal" | "vertical";

/** 노드 크기와 간격(px). 그래프 좌표계는 문서 방향과 무관하다(가로면 왼쪽→오른쪽, 세로면 위→아래). */
export const metrics = { nodeW: 190, nodeH: 64, colGap: 84, rowGap: 14, pad: 16, layerGap: 44, siblingGap: 16 } as const;

/** 열이 이 개수를 넘는 깊은 그래프는 세로 배치가 기본이다(가로로 길어져 스크롤이 길어지는 것을 막는다). */
export const verticalFrom = 4;

/** 방향 기본값: 열이 verticalFrom 이상이면 세로, 아니면 가로. */
export function defaultOrientation(layout: Pick<GraphLayout, "columns">): GraphOrientation {
  return layout.columns >= verticalFrom ? "vertical" : "horizontal";
}

const sweeps = 4;

/**
 * 의존성 DAG 를 왼쪽→오른쪽 계층 배치한다. 순수 함수다(같은 입력이면 같은 좌표).
 * - 열 = 아이템의 깊이: needs 가 없으면 0, 아니면 1 + max(needs 의 열). 왼쪽이 먼저 만들어지는 종단점이다.
 * - needs 가 가리키는데 items 에 없는 id · 자기 참조 · 중복 간선은 간선에서 뺀다. 순환은 되돌아오는 간선을 끊고 열을 계산한다(방어).
 * - 열 안 순서는 바리센터(이웃 순서의 평균) 스윕으로 간선 교차를 줄인다: 사전 아이템 기준, 의존하는 쪽 기준을 번갈아 sweeps 번.
 * - 각 열은 가장 큰 열에 맞춰 가운데 정렬한다(가로면 세로 가운데, 세로면 가로 가운데).
 * - orientation=vertical 이면 같은 순서로 열을 가로줄(위→아래)로 놓는다. 간선은 사전 아이템 아래 가운데에서 의존하는 쪽 위 가운데로 간다.
 */
export function layoutPlanGraph(items: PlanItem[], orientation: GraphOrientation = "horizontal"): GraphLayout {
  const ids = new Set(items.map((item) => item.id));
  const needs = new Map<string, string[]>();
  for (const item of items) {
    const own: string[] = [];
    for (const need of item.needs ?? []) if (need !== item.id && ids.has(need) && !own.includes(need)) own.push(need);
    needs.set(item.id, own);
  }

  const col = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    const known = col.get(id);
    if (known !== undefined) return known;
    visiting.add(id);
    let value = 0;
    for (const need of needs.get(id) ?? []) if (!visiting.has(need)) value = Math.max(value, depth(need) + 1);
    visiting.delete(id);
    col.set(id, value);
    return value;
  };
  for (const item of items) depth(item.id);

  const columns = items.reduce((max, item) => Math.max(max, (col.get(item.id) ?? 0) + 1), 0);
  const order: string[][] = Array.from({ length: columns }, () => []);
  for (const item of items) order[col.get(item.id) ?? 0].push(item.id);

  const dependents = new Map<string, string[]>();
  for (const [id, list] of needs) for (const need of list) dependents.set(need, [...(dependents.get(need) ?? []), id]);

  const position = new Map<string, number>();
  const index = () => order.forEach((column) => column.forEach((id, i) => position.set(id, i)));
  const reorder = (column: string[], neighbors: Map<string, string[]>) => {
    const before = new Map(column.map((id, i) => [id, i]));
    const key = new Map<string, number>();
    column.forEach((id, i) => {
      const around = (neighbors.get(id) ?? []).map((other) => position.get(other)).filter((p): p is number => p !== undefined);
      key.set(id, around.length > 0 ? around.reduce((a, b) => a + b, 0) / around.length : i);
    });
    column.sort((a, b) => (key.get(a) as number) - (key.get(b) as number) || (before.get(a) as number) - (before.get(b) as number));
  };
  index();
  for (let pass = 0; pass < sweeps; pass += 1) {
    if (pass % 2 === 0) {
      for (let c = 1; c < columns; c += 1) {
        reorder(order[c], needs);
        index();
      }
    } else {
      for (let c = columns - 2; c >= 0; c -= 1) {
        reorder(order[c], dependents);
        index();
      }
    }
  }

  const { nodeW, nodeH, colGap, rowGap, pad, layerGap, siblingGap } = metrics;
  const vertical = orientation === "vertical";
  const tallest = order.reduce((max, column) => Math.max(max, column.length), 0);
  const innerHeight = tallest > 0 ? tallest * nodeH + (tallest - 1) * rowGap : 0;
  const innerWidth = tallest > 0 ? tallest * nodeW + (tallest - 1) * siblingGap : 0;
  const nodes: GraphNode[] = [];
  order.forEach((column, c) => {
    if (vertical) {
      const span = column.length * nodeW + Math.max(0, column.length - 1) * siblingGap;
      const left = pad + (innerWidth - span) / 2;
      column.forEach((id, row) => nodes.push({ id, col: c, x: left + row * (nodeW + siblingGap), y: pad + c * (nodeH + layerGap), w: nodeW, h: nodeH }));
      return;
    }
    const span = column.length * nodeH + Math.max(0, column.length - 1) * rowGap;
    const top = pad + (innerHeight - span) / 2;
    column.forEach((id, row) => nodes.push({ id, col: c, x: pad + c * (nodeW + colGap), y: top + row * (nodeH + rowGap), w: nodeW, h: nodeH }));
  });
  const at = new Map(nodes.map((node) => [node.id, node]));

  const edges: GraphEdge[] = [];
  for (const item of items) {
    const to = at.get(item.id);
    for (const need of needs.get(item.id) ?? []) {
      const from = at.get(need);
      if (!from || !to || from.col >= to.col) continue; // 순환으로 끊긴 간선(같은/뒤쪽 열)은 그리지 않는다.
      if (vertical) {
        const x1 = from.x + from.w / 2;
        const y1 = from.y + from.h;
        const x2 = to.x + to.w / 2;
        const y2 = to.y;
        const bend = Math.max(18, (y2 - y1) / 2);
        edges.push({ from: need, to: item.id, path: `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}` });
        continue;
      }
      const x1 = from.x + from.w;
      const y1 = from.y + from.h / 2;
      const x2 = to.x;
      const y2 = to.y + to.h / 2;
      const bend = Math.max(24, (x2 - x1) / 2);
      edges.push({ from: need, to: item.id, path: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` });
    }
  }

  const width = columns === 0 ? 0 : vertical ? pad * 2 + innerWidth : pad * 2 + columns * nodeW + (columns - 1) * colGap;
  const height = columns === 0 ? 0 : vertical ? pad * 2 + columns * nodeH + (columns - 1) * layerGap : pad * 2 + innerHeight;
  return { nodes, edges, width, height, columns };
}

/** 선택한 노드의 이웃: 직접 필요로 하는 아이템(needs)과 그것을 필요로 하는 아이템(dependents). 없는 id 는 뺀다. */
export function neighborsOf(items: PlanItem[], id: string): { needs: PlanItem[]; dependents: PlanItem[] } {
  const byId = new Map(items.map((item) => [item.id, item]));
  const own = byId.get(id);
  return {
    needs: (own?.needs ?? []).map((need) => byId.get(need)).filter((item): item is PlanItem => item !== undefined && item.id !== id),
    dependents: items.filter((item) => item.id !== id && (item.needs ?? []).includes(id))
  };
}
