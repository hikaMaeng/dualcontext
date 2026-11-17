export type LayoutNode = { id: string; col: number; x: number; y: number; w: number; h: number };
export type LayoutEdge<K extends string = string> = {
  from: string;
  to: string;
  kind: K;
  /** from 노드의 나가는 쪽 가운데에서 to 노드의 들어오는 쪽 가운데로 가는 SVG 3차 곡선 경로. */
  path: string;
};
export type Layout<K extends string = string> = { nodes: LayoutNode[]; edges: LayoutEdge<K>[]; width: number; height: number; columns: number };

/**
 * 배치 방향. horizontal = 왼쪽(먼저)→오른쪽(나중), vertical = 위(먼저)→아래(나중).
 * 시간 순서(질의 → 분해 → 아이템 → 답변 → 평가 → 보강)가 한 방향으로 읽히게 하는 것이 목적이고, 깊은 흐름은 가로로 길어지므로 세로가 기본이 되기도 한다.
 */
export type Orientation = "horizontal" | "vertical";

/** 노드 크기와 간격(px). 그래프 좌표계는 문서 방향과 무관하다(가로면 왼쪽→오른쪽, 세로면 위→아래). */
export const metrics = { nodeW: 200, nodeH: 68, colGap: 80, rowGap: 16, pad: 24, layerGap: 56, siblingGap: 18 } as const;

/** 층이 이 개수 이상인 깊은 그래프는 세로 배치가 기본이다. */
export const verticalFrom = 5;

export function defaultOrientation(layout: Pick<Layout, "columns">): Orientation {
  return layout.columns >= verticalFrom ? "vertical" : "horizontal";
}

const sweeps = 4;

/**
 * 방향 있는 그래프(간선 from → to)를 층으로 나눠 배치한다. 순수 함수다(같은 입력이면 같은 좌표).
 * - 층 = 가장 긴 경로 길이: 들어오는 간선이 없으면 0, 아니면 1 + max(앞 노드의 층). 먼저 일어난 일이 앞 층이다.
 * - 없는 노드를 가리키는 간선 · 자기 참조 · 중복은 뺀다. 순환은 되돌아오는 간선을 끊고 층을 계산한다(방어). 층을 거스르는 간선은 그리지 않는다.
 * - 층 안 순서는 바리센터(이웃 순서의 평균) 스윕으로 간선 교차를 줄인다: 앞 노드 기준, 뒤 노드 기준을 번갈아 sweeps 번.
 * - 각 층은 가장 큰 층에 맞춰 가운데 정렬한다(가로면 세로 가운데, 세로면 가로 가운데).
 * hidden 간선은 층 계산과 순서에는 쓰지만 그리지 않는다(다른 방식으로 그리는 간선의 배치 제약).
 * 입력 노드 순서가 같은 층 안의 처음 순서이므로, 호출자는 중요한 노드를 앞에 둔다.
 */
export function layoutGraph<K extends string>(ids: string[], edges: { from: string; to: string; kind: K; hidden?: boolean }[], orientation: Orientation = "horizontal"): Layout<K> {
  const known = new Set(ids);
  const incoming = new Map<string, string[]>();
  for (const id of ids) incoming.set(id, []);
  for (const edge of edges) {
    const list = incoming.get(edge.to);
    if (list && known.has(edge.from) && edge.from !== edge.to && !list.includes(edge.from)) list.push(edge.from);
  }

  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    visiting.add(id);
    let value = 0;
    for (const from of incoming.get(id) ?? []) if (!visiting.has(from)) value = Math.max(value, depth(from) + 1);
    visiting.delete(id);
    layer.set(id, value);
    return value;
  };
  for (const id of ids) depth(id);

  const columns = ids.reduce((max, id) => Math.max(max, (layer.get(id) ?? 0) + 1), 0);
  const order: string[][] = Array.from({ length: columns }, () => []);
  for (const id of ids) order[layer.get(id) ?? 0].push(id);

  const outgoing = new Map<string, string[]>();
  for (const [to, list] of incoming) for (const from of list) outgoing.set(from, [...(outgoing.get(from) ?? []), to]);

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
        reorder(order[c], incoming);
        index();
      }
    } else {
      for (let c = columns - 2; c >= 0; c -= 1) {
        reorder(order[c], outgoing);
        index();
      }
    }
  }

  const { nodeW, nodeH, colGap, rowGap, pad, layerGap, siblingGap } = metrics;
  const vertical = orientation === "vertical";
  const tallest = order.reduce((max, column) => Math.max(max, column.length), 0);
  const innerHeight = tallest > 0 ? tallest * nodeH + (tallest - 1) * rowGap : 0;
  const innerWidth = tallest > 0 ? tallest * nodeW + (tallest - 1) * siblingGap : 0;
  const nodes: LayoutNode[] = [];
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

  const drawn: LayoutEdge<K>[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    const from = at.get(edge.from);
    const to = at.get(edge.to);
    const dedupe = `${edge.from}>${edge.to}`;
    if (edge.hidden || !from || !to || from.col >= to.col || seen.has(dedupe)) continue; // 순환으로 끊긴 간선(같은/앞쪽 층)은 그리지 않는다.
    seen.add(dedupe);
    if (vertical) {
      const x1 = from.x + from.w / 2;
      const y1 = from.y + from.h;
      const x2 = to.x + to.w / 2;
      const y2 = to.y;
      const bend = Math.max(18, (y2 - y1) / 2);
      drawn.push({ from: edge.from, to: edge.to, kind: edge.kind, path: `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}` });
      continue;
    }
    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    const bend = Math.max(24, (x2 - x1) / 2);
    drawn.push({ from: edge.from, to: edge.to, kind: edge.kind, path: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` });
  }

  const width = columns === 0 ? 0 : vertical ? pad * 2 + innerWidth : pad * 2 + columns * nodeW + (columns - 1) * colGap;
  const height = columns === 0 ? 0 : vertical ? pad * 2 + columns * nodeH + (columns - 1) * layerGap : pad * 2 + innerHeight;
  return { nodes, edges: drawn, width, height, columns };
}

/** 분류 그래프 틀: 그 그룹 노드들을 감싸는 사각형(여백 포함). 그룹에 배치된 노드가 없으면 만들지 않는다. */
export type GroupFrame = { n: number; x: number; y: number; w: number; h: number };

export const frameMetrics = { pad: 10, header: 26 } as const;

export function groupFrames(layout: Pick<Layout, "nodes">, groups: { n: number; nodeIds: string[] }[]): GroupFrame[] {
  const at = new Map(layout.nodes.map((node) => [node.id, node]));
  const frames: GroupFrame[] = [];
  for (const group of groups) {
    const boxes = group.nodeIds.map((id) => at.get(id)).filter((node): node is LayoutNode => node !== undefined);
    if (boxes.length === 0) continue;
    const left = Math.min(...boxes.map((node) => node.x));
    const top = Math.min(...boxes.map((node) => node.y));
    const right = Math.max(...boxes.map((node) => node.x + node.w));
    const bottom = Math.max(...boxes.map((node) => node.y + node.h));
    frames.push({ n: group.n, x: left - frameMetrics.pad, y: top - frameMetrics.pad - frameMetrics.header, w: right - left + frameMetrics.pad * 2, h: bottom - top + frameMetrics.pad * 2 + frameMetrics.header });
  }
  return frames;
}

type Arrow = { from: string; to: string; kind: string };

/**
 * 캔버스용 배치 간선으로 바꾼다. 한 분류 그래프 안에서는 "의존하는 쪽이 위, 사전이 아래"가 되도록 needs 를 뒤집는다(층이 곧 의존 깊이).
 * 다른 그래프 사이의 needs(먼저 만든 아이템 → 나중에 만든 아이템)는 시간 방향 그대로 둔다.
 * feed(조립)는 그리지 않고(hidden) 층 제약으로만 쓴다: 답변은 아이템이 속한 분류 그래프의 모든 노드 아래에 놓인다. 그리기는 feedPaths 가 한다.
 */
export function arrangeEdges<E extends Arrow>(edges: E[], groups: { n: number; nodeIds: string[] }[]): (E & { hidden?: boolean })[] {
  const groupOf = new Map<string, { n: number; nodeIds: string[] }>();
  for (const group of groups) for (const id of group.nodeIds) groupOf.set(id, group);
  const out: (E & { hidden?: boolean })[] = [];
  const hidden = new Set<string>();
  for (const edge of edges) {
    const own = groupOf.get(edge.from);
    if (edge.kind === "needs" && own && own === groupOf.get(edge.to)) out.push({ ...edge, from: edge.to, to: edge.from });
    else if (edge.kind === "feed" && own) {
      for (const member of own.nodeIds) {
        const key = `${member}>${edge.to}`;
        if (!hidden.has(key)) {
          hidden.add(key);
          out.push({ ...edge, from: member, hidden: true });
        }
      }
    } else out.push(edge);
  }
  return out;
}

/** 분류 그래프 틀에서 답변으로 가는 조립 간선: 같은 틀 · 같은 답변으로 가는 feed 는 한 줄로 합친다(members = 그 답변을 만든 틀 안의 아이템). */
export type FeedPath = { group: number; to: string; members: string[]; path: string };

export function feedPaths(layout: Pick<Layout, "nodes">, frames: GroupFrame[], feeds: Arrow[], groups: { n: number; nodeIds: string[] }[], orientation: Orientation): FeedPath[] {
  const at = new Map(layout.nodes.map((node) => [node.id, node]));
  const out: FeedPath[] = [];
  for (const group of groups) {
    const frame = frames.find((entry) => entry.n === group.n);
    if (!frame) continue;
    const mine = feeds.filter((feed) => feed.kind === "feed" && group.nodeIds.includes(feed.from));
    for (const to of [...new Set(mine.map((feed) => feed.to))]) {
      const target = at.get(to);
      if (!target) continue;
      const members = mine.filter((feed) => feed.to === to).map((feed) => feed.from);
      if (orientation === "vertical") {
        const x1 = frame.x + frame.w / 2;
        const y1 = frame.y + frame.h;
        const x2 = target.x + target.w / 2;
        const y2 = target.y;
        if (y2 <= y1) continue;
        const bend = Math.max(18, (y2 - y1) / 2);
        out.push({ group: group.n, to, members, path: `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}` });
      } else {
        const x1 = frame.x + frame.w;
        const y1 = frame.y + frame.h / 2;
        const x2 = target.x;
        const y2 = target.y + target.h / 2;
        if (x2 <= x1) continue;
        const bend = Math.max(24, (x2 - x1) / 2);
        out.push({ group: group.n, to, members, path: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` });
      }
    }
  }
  return out;
}
