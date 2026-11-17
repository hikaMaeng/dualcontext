import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "../../../../../components/ui/button";
import type { Texts } from "../../../../../i18n";
import { cn } from "../../../../../lib/utils";
import { defaultOrientation, frameMetrics, groupFrames, layoutGraph, type Orientation } from "../layout";
import { neighborsOf, type EdgeKind, type RunGraph } from "../model";
import { groupTitle, nodeAriaLabel, nodeText, stateMark } from "./labels";
import { CanvasNode } from "./node";
import { RSC } from "./resource";

type Props = { graph: RunGraph; query: string; selectedId: string | null; onSelect: (id: string) => void; t: Texts };

/** 간선 종류마다 선 모양이 다르다(색 + 모양). */
const edgeLook: Record<EdgeKind, { dash?: string; width: number; tone: string }> = {
  needs: { width: 1.5, tone: "stroke-muted" },
  derive: { dash: "6 4", width: 1.5, tone: "stroke-accent" },
  feed: { dash: "2 3", width: 1.25, tone: "stroke-muted" },
  flow: { width: 1.25, tone: "stroke-line" }
};
const legend: { kind: EdgeKind; text: RSC }[] = [
  { kind: "needs", text: RSC.RUNS_CANVAS_LEGEND_NEEDS_TEXT },
  { kind: "derive", text: RSC.RUNS_CANVAS_LEGEND_DERIVE_TEXT },
  { kind: "feed", text: RSC.RUNS_CANVAS_LEGEND_FEED_TEXT },
  { kind: "flow", text: RSC.RUNS_CANVAS_LEGEND_FLOW_TEXT }
];
const zoomStep = 0.15;

/**
 * 실행 전체를 한 장으로 보는 그래프(SVG): 질의 → 질의 분해 → 분류 그래프(컨텍스트 아이템 DAG) → 답변 → 평가 → 보강 그래프 → … → 최종 답변.
 * 층 순서가 시간 순서이고 방향은 가로(왼쪽→오른쪽) · 세로(위→아래)를 고를 수 있다(고르지 않으면 층이 많은 깊은 그래프는 세로).
 * 분류 그래프마다 틀을 그려 도출 사유(질의 분해 · 평가 r)와 걸린 시간을 머리에 적는다. 노드를 고르면(클릭 · Enter · Space) 이웃과 간선이 강조되고
 * 상세는 오른쪽 패널이 보인다. 확대 · 축소 · 맞춤과 가로 · 세로 전환이 있고, 넘치면 스크롤한다(캔버스는 문서 방향과 무관하게 ltr).
 */
export function RunCanvas({ graph, query, selectedId, onSelect, t }: Props) {
  const [chosen, setChosen] = useState<Orientation | null>(null);
  const [zoom, setZoom] = useState<number | "fit">(1);
  const ids = useMemo(() => graph.nodes.map((node) => node.id), [graph.nodes]);
  const natural = useMemo(() => layoutGraph(ids, graph.edges), [ids, graph.edges]);
  const orientation = chosen ?? defaultOrientation(natural);
  const layout = useMemo(() => (orientation === "horizontal" ? natural : layoutGraph(ids, graph.edges, orientation)), [ids, graph.edges, natural, orientation]);
  const frames = useMemo(() => groupFrames(layout, graph.groups), [layout, graph.groups]);
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const near = selectedId ? neighborsOf(graph, selectedId) : null;
  const related = new Set(selectedId && near ? [selectedId, ...near.inputs.map((n) => n.id), ...near.outputs.map((n) => n.id)] : []);

  // 틀 머리가 위로 삐져나오는 만큼 보이는 영역을 위로 넓힌다.
  const top = Math.min(0, ...frames.map((frame) => frame.y)) - 4;
  const width = layout.width;
  const height = layout.height - top;
  const scale = zoom === "fit" ? null : zoom;

  return (
    <section aria-labelledby="run-canvas-heading" data-testid="run-canvas-section" className="grid min-w-0 content-start gap-2">
      <h3 id="run-canvas-heading" className="sr-only">{t[RSC.RUNS_CANVAS_LABEL]}</h3>
      <p className="text-xs text-muted">{t[RSC.RUNS_CANVAS_HINT_MESSAGE]}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <div role="group" aria-label={t[RSC.RUNS_CANVAS_ORIENTATION_LABEL]} data-testid="run-canvas-orientation" data-orientation={orientation} className="flex items-center gap-2">
          <span className="text-muted">{t[RSC.RUNS_CANVAS_ORIENTATION_LABEL]}</span>
          {(["vertical", "horizontal"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={orientation === value}
              data-testid={`run-canvas-orientation-${value}`}
              onClick={() => setChosen(value)}
              className={cn("rounded border px-2 py-0.5", orientation === value ? "border-accent text-accent" : "border-line text-muted")}
            >
              {value === "horizontal" ? t[RSC.RUNS_CANVAS_ORIENTATION_HORIZONTAL_TEXT] : t[RSC.RUNS_CANVAS_ORIENTATION_VERTICAL_TEXT]}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t[RSC.RUNS_CANVAS_ZOOM_LABEL]} data-testid="run-canvas-zoom" className="flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label={t[RSC.RUNS_CANVAS_ZOOM_OUT_BUTTON]} data-testid="run-canvas-zoom-out" onClick={() => setZoom((current) => Math.max(0.3, (current === "fit" ? 1 : current) - zoomStep))}><Minus aria-hidden="true" className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="sm" aria-label={t[RSC.RUNS_CANVAS_ZOOM_IN_BUTTON]} data-testid="run-canvas-zoom-in" onClick={() => setZoom((current) => Math.min(2, (current === "fit" ? 1 : current) + zoomStep))}><Plus aria-hidden="true" className="h-3.5 w-3.5" /></Button>
          <button type="button" aria-pressed={zoom === "fit"} data-testid="run-canvas-zoom-fit" onClick={() => setZoom("fit")} className={cn("rounded border px-2 py-0.5", zoom === "fit" ? "border-accent text-accent" : "border-line text-muted")}>{t[RSC.RUNS_CANVAS_ZOOM_FIT_BUTTON]}</button>
          <button type="button" data-testid="run-canvas-zoom-reset" onClick={() => setZoom(1)} className="rounded border border-line px-2 py-0.5 text-muted">{t[RSC.RUNS_CANVAS_ZOOM_RESET_BUTTON]}</button>
        </div>
      </div>
      <div
        role="region"
        tabIndex={0}
        dir="ltr"
        aria-label={t[RSC.RUNS_CANVAS_LABEL]}
        data-testid="run-canvas"
        className="max-h-[78vh] overflow-auto rounded-md border border-line bg-sidebar p-1"
      >
        <svg
          width={scale === null ? "100%" : width * scale}
          height={scale === null ? undefined : height * scale}
          viewBox={`0 ${top} ${width} ${height}`}
          data-testid="run-canvas-svg"
          data-orientation={orientation}
          data-nodes={layout.nodes.length}
          data-edges={layout.edges.length}
          className="block max-w-none"
        >
          <defs>
            <marker id="run-canvas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 z" className="fill-muted" /></marker>
            <marker id="run-canvas-arrow-on" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 z" className="fill-accent" /></marker>
          </defs>
          {frames.map((frame) => {
            const group = graph.groups.find((entry) => entry.n === frame.n);
            if (!group) return null;
            return (
              <g key={frame.n} data-testid={`run-group-${frame.n}`} data-group={frame.n}>
                <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} rx={10} className="fill-canvas/40 stroke-line" strokeDasharray="3 3" strokeWidth={1} />
                <text x={frame.x + 8} y={frame.y + frameMetrics.header - 9} className="fill-muted text-[11px] font-semibold">{groupTitle(group, t)}</text>
              </g>
            );
          })}
          {layout.edges.map((edge) => {
            const active = selectedId !== null && (edge.from === selectedId || edge.to === selectedId);
            const look = edgeLook[edge.kind as EdgeKind];
            return (
              <path
                key={`${edge.from}>${edge.to}`}
                d={edge.path}
                fill="none"
                data-testid="run-canvas-edge"
                data-from={edge.from}
                data-to={edge.to}
                data-kind={edge.kind}
                data-active={active ? "true" : "false"}
                markerEnd={active ? "url(#run-canvas-arrow-on)" : "url(#run-canvas-arrow)"}
                strokeWidth={active ? 2.5 : look.width}
                strokeDasharray={look.dash}
                className={active ? "stroke-accent" : selectedId ? "stroke-line" : look.tone}
              />
            );
          })}
          {layout.nodes.map((box) => {
            const node = byId.get(box.id);
            if (!node) return null;
            const text = nodeText(node, t, query);
            return (
              <CanvasNode
                key={box.id}
                node={node}
                box={box}
                title={text.title}
                sub={text.sub}
                meta={text.meta}
                mark={stateMark[node.state]}
                label={nodeAriaLabel(node, t, query)}
                selected={selectedId === box.id}
                dimmed={selectedId !== null && !related.has(box.id)}
                onSelect={onSelect}
              />
            );
          })}
        </svg>
      </div>
      <ul aria-label={t[RSC.RUNS_CANVAS_LEGEND_LABEL]} data-testid="run-canvas-legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {legend.map((entry) => (
          <li key={entry.kind} data-kind={entry.kind} className="inline-flex items-center gap-1">
            <svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" strokeWidth="1.5" strokeDasharray={edgeLook[entry.kind].dash} className={edgeLook[entry.kind].tone} /></svg>
            {t[entry.text]}
          </li>
        ))}
        {(["done", "running", "pending", "error", "empty"] as const).map((state) => (
          <li key={state} data-state={state}><span aria-hidden="true" className="font-bold">{stateMark[state]}</span> {t[{ done: RSC.RUNS_CANVAS_STATE_DONE_TEXT, running: RSC.RUNS_CANVAS_STATE_RUNNING_TEXT, pending: RSC.RUNS_CANVAS_STATE_PENDING_TEXT, error: RSC.RUNS_CANVAS_STATE_ERROR_TEXT, empty: RSC.RUNS_CANVAS_STATE_EMPTY_TEXT }[state]]}</li>
        ))}
      </ul>
    </section>
  );
}
