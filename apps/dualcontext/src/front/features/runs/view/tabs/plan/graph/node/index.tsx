import type { PlanItem } from "dualcontext_domain/common";
import { cn } from "../../../../../../../lib/utils";
import { wrapName } from "../label";
import type { GraphNode } from "../layout";

/** 상태를 색만으로 구분하지 않도록 글자 표식을 함께 쓴다(언어와 무관한 기호). */
export const statusMark: Record<string, string> = { built: "✓", empty: "○", error: "!", pending: "…" };

const frame: Record<string, string> = {
  built: "stroke-accent",
  empty: "stroke-muted",
  error: "stroke-danger",
  pending: "stroke-line"
};
const markTone: Record<string, string> = {
  built: "fill-accent",
  empty: "fill-muted",
  error: "fill-danger",
  pending: "fill-muted"
};

/** 이름 줄 폭 예산(em). 노드 폭 190px 에 12px 글자 · 좌우 여백 10px 를 뺀 값. */
const nameBudget = 14.5;

type Props = {
  item: PlanItem;
  box: GraphNode;
  statusText: string;
  finalText: string;
  roundText: string;
  selected: boolean;
  /** 다른 노드가 선택돼 있고 이 노드는 그 이웃이 아니다(흐리게). */
  dimmed: boolean;
  onSelect: (id: string) => void;
};

/**
 * 그래프 노드 하나(SVG). 이름 최대 2줄(전체는 title · aria-label), 상태 표식 + 상태 글자, 최종(top) · 보강 라운드 표식.
 * 포커스 가능한 버튼이라 Enter · Space 로도 고른다. 최종 노드는 테두리가 굵다.
 */
export function GraphNodeView({ item, box, statusText, finalText, roundText, selected, dimmed, onSelect }: Props) {
  const lines = wrapName(item.name, nameBudget, 2);
  const mark = statusMark[item.status] ?? statusMark.pending;
  const tags = [statusText, ...(item.top ? [finalText] : []), ...(item.round > 0 ? [`${roundText} ${item.round}`] : [])];
  const label = `${item.name} · ${tags.join(" · ")}`;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      data-testid={`plan-graph-node-${item.id}`}
      data-item-id={item.id}
      data-status={item.status}
      data-top={item.top ? "true" : "false"}
      data-round={item.round}
      data-selected={selected ? "true" : "false"}
      transform={`translate(${box.x},${box.y})`}
      className={cn("cursor-pointer outline-none [&:focus-visible>rect]:stroke-fg", dimmed && "opacity-40")}
      onClick={() => onSelect(item.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item.id);
        }
      }}
    >
      <title>{label}</title>
      <rect
        width={box.w}
        height={box.h}
        rx={8}
        strokeWidth={item.top ? 3 : selected ? 2.5 : 1.25}
        strokeDasharray={item.status === "pending" ? "4 3" : undefined}
        className={cn("fill-surface", frame[item.status] ?? frame.pending, selected && "fill-sidebar")}
      />
      {lines.map((line, index) => (
        <text key={index} x={10} y={18 + index * 15} className="fill-fg text-[12px] font-medium">{line}</text>
      ))}
      <text x={10} y={box.h - 9} className="fill-muted text-[10px]">
        <tspan className={cn("text-[12px] font-bold", markTone[item.status] ?? markTone.pending)}>{mark}</tspan>
        <tspan dx={4}>{tags.join(" · ")}</tspan>
      </text>
    </g>
  );
}
