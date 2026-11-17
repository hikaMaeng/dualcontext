import { useMemo, useState } from "react";
import { cn } from "../../../../../../lib/utils";
import type { PlanItem } from "dualcontext_domain/common";
import { itemStatusText } from "../../../../../../components/plan-labels";
import type { Texts } from "../../../../../../i18n";
import { GraphDetail } from "./detail";
import { defaultOrientation, layoutPlanGraph, neighborsOf, type GraphOrientation } from "./layout";
import { GraphNodeView, statusMark } from "./node";
import { RSC } from "./resource";

const legendStatuses = ["built", "empty", "error", "pending"] as const;

/**
 * 의존성 그래프(SVG). 먼저 만들어지는 사전 컨텍스트(종단점)에서 그것을 받는 쪽으로 화살표가 향하고 맨 끝이 최종 컨텍스트다.
 * 배치 방향은 가로(왼쪽→오른쪽) · 세로(위→아래)를 고를 수 있다. 고르지 않았으면 열이 많은 깊은 그래프는 세로, 아니면 가로다
 * (깊은 사슬은 가로로 길어져 좁은 화면에서 스크롤이 길다). 고른 방향은 이 화면에서만 기억한다.
 * 노드는 포커스 가능한 버튼이며 고르면(클릭 · Enter · Space) 그 노드와 이웃 · 연결 간선이 강조되고 아래에 상세가 열린다. 다시 고르면 해제된다.
 * 가로가 넘치면 래퍼가 스크롤한다(키보드로 포커스해 스크롤). 방향은 문서 방향과 무관하게 왼쪽→오른쪽(dir=ltr 고정).
 * 그래프를 못 쓰는 사용자를 위한 같은 내용의 텍스트 대안은 바로 아래 의존성 트리다. 진행 중 부분 기록이어도 그대로 그린다.
 */
export function PlanGraph({ items, t }: { items: PlanItem[]; t: Texts }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<GraphOrientation | null>(null);
  const natural = useMemo(() => layoutPlanGraph(items), [items]);
  const orientation = chosen ?? defaultOrientation(natural);
  const layout = useMemo(() => (orientation === "horizontal" ? natural : layoutPlanGraph(items, orientation)), [items, natural, orientation]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const near = selected ? neighborsOf(items, selected.id) : null;
  const related = new Set(selected && near ? [selected.id, ...near.needs.map((n) => n.id), ...near.dependents.map((n) => n.id)] : []);
  const toggle = (id: string) => setSelectedId((current) => (current === id ? null : id));

  return (
    <section aria-labelledby="plan-graph-heading" data-testid="plan-graph-section" className="grid gap-2">
      <h3 id="plan-graph-heading" className="text-sm font-semibold text-muted">{t[RSC.RUNS_PLAN_GRAPH_HEADING_TEXT]}</h3>
      {items.length === 0 ? (
        <p role="status" data-testid="plan-graph-empty" className="text-sm text-muted">{t[RSC.RUNS_PLAN_GRAPH_EMPTY_MESSAGE]}</p>
      ) : (
        <>
          <p className="text-xs text-muted">{t[RSC.RUNS_PLAN_GRAPH_HINT_MESSAGE]}</p>
          <div role="group" aria-label={t[RSC.RUNS_PLAN_GRAPH_ORIENTATION_LABEL]} data-testid="plan-graph-orientation" data-orientation={orientation} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">{t[RSC.RUNS_PLAN_GRAPH_ORIENTATION_LABEL]}</span>
            {(["horizontal", "vertical"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={orientation === value}
                data-testid={`plan-graph-orientation-${value}`}
                onClick={() => setChosen(value)}
                className={cn("rounded border px-2 py-0.5", orientation === value ? "border-accent text-accent" : "border-line text-muted")}
              >
                {value === "horizontal" ? t[RSC.RUNS_PLAN_GRAPH_ORIENTATION_HORIZONTAL_TEXT] : t[RSC.RUNS_PLAN_GRAPH_ORIENTATION_VERTICAL_TEXT]}
              </button>
            ))}
          </div>
          <div
            role="region"
            tabIndex={0}
            dir="ltr"
            aria-label={t[RSC.RUNS_PLAN_GRAPH_CANVAS_LABEL]}
            data-testid="plan-graph-canvas"
            className="max-h-[70vh] overflow-auto rounded-md border border-line bg-sidebar p-1"
          >
            <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} data-testid="plan-graph" data-orientation={orientation} data-nodes={layout.nodes.length} data-edges={layout.edges.length} className="block max-w-none">
              <defs>
                <marker id="plan-graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L8,4 L0,8 z" className="fill-muted" />
                </marker>
                <marker id="plan-graph-arrow-on" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L8,4 L0,8 z" className="fill-accent" />
                </marker>
              </defs>
              {layout.edges.map((edge) => {
                const active = selected !== null && (edge.from === selected.id || edge.to === selected.id);
                return (
                  <path
                    key={`${edge.from}>${edge.to}`}
                    d={edge.path}
                    fill="none"
                    data-testid="plan-graph-edge"
                    data-from={edge.from}
                    data-to={edge.to}
                    data-active={active ? "true" : "false"}
                    markerEnd={active ? "url(#plan-graph-arrow-on)" : "url(#plan-graph-arrow)"}
                    strokeWidth={active ? 2.25 : 1.25}
                    className={active ? "stroke-accent" : selected ? "stroke-line" : "stroke-muted"}
                  />
                );
              })}
              {layout.nodes.map((box) => {
                const item = byId.get(box.id);
                if (!item) return null;
                return (
                  <GraphNodeView
                    key={box.id}
                    item={item}
                    box={box}
                    statusText={itemStatusText(item.status, t)}
                    finalText={t[RSC.RUNS_PLAN_GRAPH_FINAL_TEXT]}
                    roundText={t[RSC.RUNS_PLAN_GRAPH_ROUND_TEXT]}
                    selected={selected?.id === box.id}
                    dimmed={selected !== null && !related.has(box.id)}
                    onSelect={toggle}
                  />
                );
              })}
            </svg>
          </div>
          <ul aria-label={t[RSC.RUNS_PLAN_GRAPH_LEGEND_LABEL]} data-testid="plan-graph-legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {legendStatuses.map((status) => (
              <li key={status} data-status={status}><span aria-hidden="true" className="font-bold">{statusMark[status]}</span> {itemStatusText(status, t)}</li>
            ))}
            <li data-testid="plan-graph-legend-final"><strong className="text-fg">{t[RSC.RUNS_PLAN_GRAPH_FINAL_TEXT]}</strong></li>
            <li data-testid="plan-graph-legend-round"><strong className="text-accent">{t[RSC.RUNS_PLAN_GRAPH_ROUND_TEXT]}</strong></li>
          </ul>
          {selected ? (
            <GraphDetail items={items} item={selected} onSelect={setSelectedId} t={t} />
          ) : (
            <p data-testid="plan-graph-detail-empty" className="text-sm text-muted">{t[RSC.RUNS_PLAN_GRAPH_DETAIL_EMPTY_MESSAGE]}</p>
          )}
        </>
      )}
    </section>
  );
}
