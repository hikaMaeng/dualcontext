import { Brain, ClipboardCheck, FileText, Layers, MessageCircle, MessageSquare, Split } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { cn } from "../../../../../../lib/utils";
import type { LayoutNode } from "../../layout";
import type { NodeKind, NodeState, RunGraphNode } from "../../model";
import { wrapName } from "../label";

type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

/** 종류마다 아이콘 · 모서리 · 선 모양이 다르다(색만으로 구분하지 않는다). */
const look: Record<NodeKind, { icon: IconType; rx: number; dash?: string }> = {
  query: { icon: MessageSquare, rx: 34 },
  analyze: { icon: Split, rx: 6, dash: "2 3" },
  item: { icon: FileText, rx: 8 },
  classic: { icon: Layers, rx: 8 },
  answer: { icon: MessageCircle, rx: 16 },
  evaluate: { icon: ClipboardCheck, rx: 16, dash: "6 3" },
  "final-before": { icon: Brain, rx: 16 },
  "final-after": { icon: MessageCircle, rx: 16 }
};

const frame: Record<NodeState, string> = { done: "stroke-accent", running: "stroke-fg", pending: "stroke-line", error: "stroke-danger", empty: "stroke-muted" };
const markTone: Record<NodeState, string> = { done: "fill-accent", running: "fill-fg", pending: "fill-muted", error: "fill-danger", empty: "fill-muted" };

type Props = {
  node: RunGraphNode;
  box: LayoutNode;
  title: string;
  sub: string;
  meta: string;
  mark: string;
  label: string;
  selected: boolean;
  /** 다른 노드가 선택돼 있고 이 노드는 그 이웃이 아니다(흐리게). */
  dimmed: boolean;
  onSelect: (id: string) => void;
};

/**
 * 그래프 노드 하나(SVG). 맨 윗줄에 아이콘 + 제목(아이템은 이름 최대 2줄), 부제, 맨 아래에 상태 표식 + 측정값.
 * 포커스 가능한 버튼이라 Enter · Space 로도 고른다. 최종 노드(최종 답변 · 1차 아이템)는 테두리가 굵다.
 */
export function CanvasNode({ node, box, title, sub, meta, mark, label, selected, dimmed, onSelect }: Props) {
  const shape = look[node.kind];
  const Icon = shape.icon;
  const titleLines = node.kind === "item" ? wrapName(title, 12.5, 2) : wrapName(title, 12.5, 1);
  const subLine = wrapName(sub, node.kind === "query" ? 24 : 15.5, 1)[0] ?? "";
  const bold = node.final || (node.kind === "item" && node.item?.top);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      data-testid={`run-node-${node.id}`}
      data-node-id={node.id}
      data-kind={node.kind}
      data-state={node.state}
      data-selected={selected ? "true" : "false"}
      transform={`translate(${box.x},${box.y})`}
      className={cn("cursor-pointer outline-none [&:focus-visible>rect]:stroke-fg", dimmed && "opacity-40")}
      onClick={() => onSelect(node.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      <title>{label}</title>
      <rect
        width={box.w}
        height={box.h}
        rx={shape.rx}
        strokeWidth={bold ? 3 : selected ? 2.5 : 1.25}
        strokeDasharray={node.state === "pending" ? "4 3" : shape.dash}
        className={cn("fill-surface", frame[node.state], selected && "fill-sidebar")}
      />
      <Icon x={12} y={9} width={14} height={14} aria-hidden="true" className="text-muted" />
      {titleLines.map((line, index) => (
        <text key={index} x={32} y={20 + index * 14} className="fill-fg text-[12px] font-medium">{line}</text>
      ))}
      {subLine !== "" && <text x={12} y={titleLines.length > 1 ? 51 : 38} className="fill-muted text-[10px]">{subLine}</text>}
      <text x={12} y={box.h - 8} className="fill-muted text-[10px]">
        <tspan className={cn("text-[12px] font-bold", markTone[node.state])}>{mark}</tspan>
        <tspan dx={4}>{meta}</tspan>
      </text>
    </g>
  );
}
