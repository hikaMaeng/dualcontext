/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { arrangeEdges, defaultOrientation, feedPaths, frameMetrics, groupFrames, layoutGraph, metrics, verticalFrom } from "./index";

const e = (from: string, to: string, kind = "needs") => ({ from, to, kind });
const colOf = (ids: string[], edges: ReturnType<typeof e>[]) => Object.fromEntries(layoutGraph(ids, edges).nodes.map((n) => [n.id, n.col]));

test("빈 입력은 빈 배치다", () => {
  assert.deepEqual(layoutGraph([], []), { nodes: [], edges: [], width: 0, height: 0, columns: 0 });
  assert.deepEqual(layoutGraph([], [], "vertical"), { nodes: [], edges: [], width: 0, height: 0, columns: 0 });
});

test("층은 가장 긴 경로다: 들어오는 간선이 없으면 0, 아니면 1 + max(앞 노드)", () => {
  assert.deepEqual(colOf(["q", "a", "x", "b", "end"], [e("q", "a"), e("a", "b"), e("x", "b"), e("b", "end")]), { q: 0, a: 1, x: 0, b: 2, end: 3 });
});

test("공유되는 노드는 노드 하나에 간선 둘이고 같은 쌍의 중복 간선은 하나만 그린다", () => {
  const layout = layoutGraph(["s", "a", "b"], [e("s", "a"), e("s", "b"), e("s", "a", "feed")]);
  assert.equal(layout.nodes.filter((n) => n.id === "s").length, 1);
  assert.deepEqual(layout.edges.map((x) => `${x.from}>${x.to}`).sort(), ["s>a", "s>b"]);
  assert.equal(layout.edges.find((x) => x.to === "a")?.kind, "needs", "먼저 온 간선의 종류가 남는다");
});

test("없는 노드 · 자기 참조를 가리키는 간선은 뺀다", () => {
  const layout = layoutGraph(["a", "b"], [e("a", "a"), e("ghost", "b"), e("a", "ghost"), e("a", "b")]);
  assert.deepEqual(layout.edges.map((x) => `${x.from}>${x.to}`), ["a>b"]);
});

test("순환이 들어와도 멈추고 모든 노드를 배치하며 층을 거스르는 간선은 그리지 않는다", () => {
  const layout = layoutGraph(["a", "b", "c"], [e("a", "b"), e("b", "c"), e("c", "a")]);
  assert.equal(layout.nodes.length, 3);
  assert.ok(layout.edges.every((edge) => (layout.nodes.find((n) => n.id === edge.from)?.col ?? 0) < (layout.nodes.find((n) => n.id === edge.to)?.col ?? 0)));
});

test("같은 층의 노드는 겹치지 않는다(가로 · 세로 모두)", () => {
  const ids = ["r", "a", "b", "c", "end"];
  const edges = [e("r", "a"), e("r", "b"), e("r", "c"), e("a", "end"), e("b", "end"), e("c", "end")];
  for (const orientation of ["horizontal", "vertical"] as const) {
    const layout = layoutGraph(ids, edges, orientation);
    const nodes = layout.nodes;
    for (const a of nodes) for (const b of nodes) {
      if (a.id >= b.id) continue;
      const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
      const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlapX && overlapY, false, `${a.id} · ${b.id} 겹침 (${orientation})`);
    }
  }
});

test("세로 배치: 층은 위→아래 줄이고 같은 줄은 가로 가운데 정렬, 간선은 아래 가운데에서 위 가운데로 간다", () => {
  const layout = layoutGraph(["root", "a", "b", "top"], [e("root", "a"), e("a", "top"), e("b", "top")], "vertical");
  const at = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
  assert.ok(at.root.y < at.a.y && at.a.y < at.top.y);
  assert.equal(at.root.y, at.b.y, "같은 층은 같은 줄");
  assert.equal(at.top.x + at.top.w / 2, layout.width / 2, "한 칸짜리 줄은 폭의 가운데");
  assert.equal(layout.height, metrics.pad * 2 + 3 * metrics.nodeH + 2 * metrics.layerGap);
  const edge = layout.edges.find((x) => x.from === "a" && x.to === "top");
  assert.ok(edge);
  assert.match(edge.path, new RegExp(`^M${at.a.x + at.a.w / 2},${at.a.y + at.a.h} `));
  assert.match(edge.path, new RegExp(`${at.top.x + at.top.w / 2},${at.top.y}$`));
});

test("바리센터 정렬은 교차를 없앤다: 위쪽 소비자의 사전 노드가 위에 온다", () => {
  const layout = layoutGraph(["p1", "p2", "c1", "c2"], [e("p2", "c1"), e("p1", "c2")]);
  const y = Object.fromEntries(layout.nodes.map((n) => [n.id, n.y]));
  assert.ok((y.p1 < y.p2) === (y.c2 < y.c1), "연결된 쌍의 위아래 순서가 같다(교차 없음)");
});

test("큰 입력(300개 사슬)도 층 수 · 노드 수가 맞고 좌표가 유한하다", () => {
  const ids = Array.from({ length: 300 }, (_, i) => `n${i}`);
  const edges = ids.slice(1).map((id, i) => e(`n${i}`, id));
  for (const orientation of ["horizontal", "vertical"] as const) {
    const layout = layoutGraph(ids, edges, orientation);
    assert.equal(layout.columns, 300);
    assert.equal(layout.nodes.length, 300);
    assert.ok(Number.isFinite(layout.width) && Number.isFinite(layout.height));
    assert.equal(layout.edges.length, 299);
  }
});

test("기본 방향: 층이 verticalFrom 이상이면 세로, 아니면 가로", () => {
  assert.equal(defaultOrientation({ columns: verticalFrom - 1 }), "horizontal");
  assert.equal(defaultOrientation({ columns: verticalFrom }), "vertical");
});

test("분류 그래프 틀: 소속 노드를 감싸고 머리 높이만큼 위로 늘며, 배치되지 않은 노드는 건너뛴다", () => {
  const layout = layoutGraph(["a", "b", "c"], [e("a", "b"), e("b", "c")], "vertical");
  const at = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
  const frames = groupFrames(layout, [{ n: 1, nodeIds: ["a", "b", "ghost"] }, { n: 2, nodeIds: ["ghost"] }]);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].n, 1);
  assert.equal(frames[0].x, at.a.x - frameMetrics.pad);
  assert.equal(frames[0].y, at.a.y - frameMetrics.pad - frameMetrics.header);
  assert.equal(frames[0].y + frames[0].h, at.b.y + at.b.h + frameMetrics.pad);
});

// 질의 분해(analyze) → 최상위 t1 · t2, t1 → 사전 p1 → 사전 p2(깊이 3), 답변 a 는 두 최상위에서 조립. needs 는 데이터 방향(사전 → 의존하는 쪽).
const groupIds = ["analyze", "item:t1", "item:t2", "item:p1", "item:p2", "answer"];
const groups = [{ n: 1, nodeIds: ["item:t1", "item:t2", "item:p1", "item:p2"] }];
const raw = [
  e("analyze", "item:t1", "derive"), e("analyze", "item:t2", "derive"),
  e("item:p1", "item:t1"), e("item:p2", "item:p1"), e("item:p1", "item:t2"),
  e("item:t1", "answer", "feed"), e("item:t2", "answer", "feed")
];

test("arrangeEdges: 같은 분류 그래프 안의 needs 는 뒤집혀 최상위가 위, 사전이 아래 층이 된다", () => {
  const layout = layoutGraph(groupIds, arrangeEdges(raw, groups));
  const col = Object.fromEntries(layout.nodes.map((n) => [n.id, n.col]));
  assert.ok(col["item:t1"] < col["item:p1"] && col["item:p1"] < col["item:p2"], "t1 → p1 → p2 로 내려간다");
  assert.equal(col["item:t1"], col["item:t2"], "분해가 직접 낳은 최상위 아이템은 같은 층");
  assert.equal(col["item:t1"], col.analyze + 1);
  assert.ok(col.answer > col["item:p2"], "답변은 분류 그래프 전체 아래");
  assert.ok(!layout.edges.some((edge) => edge.kind === "feed"), "feed 는 배치 간선으로 그리지 않는다");
  assert.deepEqual(layout.edges.filter((edge) => edge.kind === "needs").map((edge) => `${edge.from}>${edge.to}`).sort(), ["item:t1>item:p1", "item:t2>item:p1", "item:p1>item:p2"].sort());
});

test("arrangeEdges: 다른 분류 그래프 사이의 needs 는 시간 방향 그대로다", () => {
  const two = [{ n: 1, nodeIds: ["a"] }, { n: 2, nodeIds: ["b"] }];
  assert.deepEqual(arrangeEdges([e("a", "b")], two), [e("a", "b")]);
});

test("feedPaths: 분류 그래프 틀 아래 가운데에서 답변 위로 한 줄(같은 답변은 합침), 가로면 틀 오른쪽에서 답변 왼쪽으로", () => {
  for (const orientation of ["vertical", "horizontal"] as const) {
    const layout = layoutGraph(groupIds, arrangeEdges(raw, groups), orientation);
    const frames = groupFrames(layout, groups);
    const paths = feedPaths(layout, frames, raw, groups, orientation);
    assert.equal(paths.length, 1);
    assert.deepEqual(paths[0].members, ["item:t1", "item:t2"]);
    assert.equal(paths[0].to, "answer");
    const frame = frames[0];
    const answer = layout.nodes.find((n) => n.id === "answer");
    assert.ok(answer);
    assert.ok(paths[0].path.startsWith(orientation === "vertical" ? `M${frame.x + frame.w / 2},${frame.y + frame.h} ` : `M${frame.x + frame.w},${frame.y + frame.h / 2} `));
    assert.ok(paths[0].path.endsWith(orientation === "vertical" ? `${answer.x + answer.w / 2},${answer.y}` : `${answer.x},${answer.y + answer.h / 2}`));
  }
});
