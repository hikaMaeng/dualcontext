import type { Texts } from "../../../../../../i18n";
import { RSC as ROOT } from "../../../../../../resource";
import { itemStatusText } from "../../../../../../components/plan-labels";
import { formatSeconds } from "../../../../format";
import type { NodeKind, NodeState, RunGraphGroup, RunGraphNode } from "../../model";
import { RSC } from "../resource";

const kindText: Record<NodeKind, RSC> = {
  query: RSC.RUNS_CANVAS_KIND_QUERY_TEXT,
  analyze: RSC.RUNS_CANVAS_KIND_ANALYZE_TEXT,
  item: RSC.RUNS_CANVAS_KIND_ITEM_TEXT,
  classic: RSC.RUNS_CANVAS_KIND_CLASSIC_TEXT,
  answer: RSC.RUNS_CANVAS_KIND_ANSWER_TEXT,
  evaluate: RSC.RUNS_CANVAS_KIND_EVALUATE_TEXT,
  "final-before": RSC.RUNS_CANVAS_KIND_BEFORE_TEXT,
  "final-after": RSC.RUNS_CANVAS_KIND_AFTER_TEXT
};

const stateKey: Record<NodeState, RSC> = {
  done: RSC.RUNS_CANVAS_STATE_DONE_TEXT,
  running: RSC.RUNS_CANVAS_STATE_RUNNING_TEXT,
  pending: RSC.RUNS_CANVAS_STATE_PENDING_TEXT,
  error: RSC.RUNS_CANVAS_STATE_ERROR_TEXT,
  empty: RSC.RUNS_CANVAS_STATE_EMPTY_TEXT
};

/** 상태를 색만으로 구분하지 않도록 글자 표식을 함께 쓴다(언어와 무관한 기호). */
export const stateMark: Record<NodeState, string> = { done: "✓", running: "▶", pending: "…", error: "!", empty: "○" };

export const kindLabel = (kind: NodeKind, t: Texts): string => t[kindText[kind]];
export const stateLabel = (state: NodeState, t: Texts): string => t[stateKey[state]];

const seconds = (ms: number, t: Texts) => `${formatSeconds(ms)}${t[ROOT.COMMON_SECONDS_TEXT]}`;

/**
 * 노드에 보일 글: 제목(아이템은 이름), 부제(라운드 · 단계 · 최종 · 질의), 맨 아랫줄의 측정값(소요 · 점수 · 길이).
 * 전체 이름은 호출하는 쪽이 title · aria-label 로 따로 둔다.
 */
export function nodeText(node: RunGraphNode, t: Texts, query: string): { title: string; sub: string; meta: string } {
  const round = node.round !== undefined ? `${t[RSC.RUNS_CANVAS_ROUND_TEXT]} ${node.round}` : "";
  const final = node.final ? t[RSC.RUNS_CANVAS_FINAL_TEXT] : "";
  const parts = (list: (string | false | undefined)[]) => list.filter((entry): entry is string => Boolean(entry)).join(" · ");
  const time = node.ms !== undefined ? seconds(node.ms, t) : "";
  switch (node.kind) {
    case "query":
      return { title: kindLabel("query", t), sub: query, meta: "" };
    case "item":
      return {
        title: node.item?.name ?? node.id,
        sub: parts([node.item && `${t[RSC.RUNS_CANVAS_LEVEL_TEXT]} ${node.item.level}`, node.item?.top && t[RSC.RUNS_CANVAS_FINAL_TEXT], node.round ? round : false]),
        meta: parts([time, node.chars ? String(node.chars) : ""])
      };
    case "evaluate":
      return {
        title: kindLabel("evaluate", t),
        sub: round,
        meta: node.score !== undefined ? parts([`${node.score}${t[RSC.RUNS_CANVAS_SCORE_TEXT]}`, node.pass ? t[RSC.RUNS_CANVAS_PASS_TEXT] : t[RSC.RUNS_CANVAS_FAIL_TEXT], time]) : time
      };
    case "answer":
      return { title: kindLabel("answer", t), sub: parts([round, final]), meta: parts([time, node.chars ? String(node.chars) : ""]) };
    case "final-after":
      return { title: kindLabel("final-after", t), sub: "", meta: parts([time, node.chars ? String(node.chars) : ""]) };
    default:
      return { title: kindLabel(node.kind, t), sub: "", meta: parts([time, node.chars ? String(node.chars) : ""]) };
  }
}

/** 노드 하나의 접근 가능한 이름: `종류 · 제목 · 상태 · 측정값`. */
export function nodeAriaLabel(node: RunGraphNode, t: Texts, query: string): string {
  const text = nodeText(node, t, query);
  const state = node.item ? itemStatusText(node.item.status, t) : stateLabel(node.state, t);
  return [kindLabel(node.kind, t), text.title !== kindLabel(node.kind, t) ? text.title : "", text.sub, state, text.meta].filter((part) => part !== "").join(" · ");
}

/** 분류 그래프 틀 머리: `분류 그래프 n · 이유 · 아이템 m · 소요`. */
export function groupTitle(group: RunGraphGroup, t: Texts): string {
  const reason = group.reason.type === "decompose" ? t[RSC.RUNS_CANVAS_GROUP_DECOMPOSE_TEXT] : `${t[RSC.RUNS_CANVAS_ROUND_TEXT]} ${group.reason.round} · ${t[RSC.RUNS_CANVAS_GROUP_EVALUATION_TEXT]}`;
  return [`${t[RSC.RUNS_CANVAS_GROUP_TITLE_TEXT]} ${group.n}`, reason, `${t[RSC.RUNS_CANVAS_GROUP_ITEMS_TEXT]} ${group.nodeIds.length}`, group.ms !== null ? seconds(group.ms, t) : ""].filter((part) => part !== "").join(" · ");
}
