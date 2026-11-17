import { ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import type { Texts } from "../../../../../i18n";
import { cn } from "../../../../../lib/utils";
import type { RunDetail } from "../../../../../lib/run";
import { RSC as ROOT } from "../../../../../resource";
import { formatSeconds } from "../../../format";
import { nodeHash } from "../../../route";
import { kindLabel, nodeText, stateLabel, stateMark } from "../canvas/labels";
import { neighborsOf, nodeOf, type RunGraph, type RunGraphNode } from "../model";
import { useNodeDetail } from "../use-node-detail";
import { AnalyzeBody } from "./kinds/analyze";
import { AnswerBody } from "./kinds/answer";
import { ClassicBody } from "./kinds/classic";
import { EvaluateBody } from "./kinds/evaluate";
import { ItemBody } from "./kinds/item";
import { QueryBody } from "./kinds/query";
import { DocStatus } from "./parts/doc-status";
import { NodeLink } from "./parts/node-link";
import { RSC } from "./resource";
import type { KindProps } from "./types";

type Props = {
  run: RunDetail;
  graph: RunGraph;
  /** 보일 노드의 키(그래프 노드 id). 그래프에 아직 없으면(진행 중) 안내만 보인다. */
  nodeId: string;
  running: boolean;
  /** 패널 확대 상태와 토글. 새 창 화면은 토글 없이 늘 확대 상태다. */
  expanded: boolean;
  onToggleExpand?: () => void;
  onSelect: (id: string) => void;
  t: Texts;
};

function Body(props: KindProps) {
  switch (props.node.kind) {
    case "query": return <QueryBody {...props} />;
    case "analyze": return <AnalyzeBody {...props} />;
    case "item": return <ItemBody {...props} />;
    case "classic": return <ClassicBody {...props} />;
    case "evaluate": return <EvaluateBody {...props} />;
    default: return <AnswerBody {...props} />;
  }
}

function Neighbors({ label, nodes, onSelect, t, testId }: { label: string; nodes: RunGraphNode[]; onSelect: (id: string) => void; t: Texts; testId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      {nodes.length === 0 ? <span className="text-muted">{t[RSC.RUNS_PANEL_NONE_TEXT]}</span> : (
        <ul data-testid={testId} className="flex flex-wrap gap-2">
          {nodes.map((node) => <li key={node.id}><NodeLink id={node.id} name={nodeText(node, t, "").title} onSelect={onSelect} /></li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * 오른쪽 노드 상세 패널: 머리(종류 · 이름 · 상태 · 소요, 확대 · 새 창으로 열기, 앞 · 뒤 노드 링크)와 종류별 본문.
 * 서버의 노드 상세 문서(프롬프트 · 라우팅 · 조사원 · 참고 컨텍스트 …)는 노드를 고를 때 읽고(실행 중이면 주기적으로 다시), 없으면 계획 기록과
 * 실행 행으로 보일 수 있는 것만 보인다. 확대하면(data-expanded) 긴 본문의 높이 제한이 풀린다.
 */
export function NodePanel({ run, graph, nodeId, running, expanded, onToggleExpand, onSelect, t }: Props) {
  const node = nodeOf(graph, nodeId);
  const doc = useNodeDetail(run.id, node ? node.id : null, { running, stored: (run.nodes ?? []).includes(nodeId) });
  const label = t[RSC.RUNS_PANEL_LABEL];
  if (!node) {
    return (
      <aside role="region" aria-label={label} data-testid="run-node-panel" data-node-key={nodeId} data-expanded={expanded ? "true" : "false"} className="group/panel rounded-md border border-line p-3">
        <p role="status" className="text-sm text-muted">{t[RSC.RUNS_PANEL_MISSING_MESSAGE]}</p>
      </aside>
    );
  }
  const text = nodeText(node, t, run.query);
  const { inputs, outputs } = neighborsOf(graph, node.id);
  const popout = () => window.open(`${window.location.pathname}${window.location.search}${nodeHash(run.id, node.id)}`, "_blank", "popup,width=1200,height=900");
  return (
    <aside
      role="region"
      aria-label={label}
      data-testid="run-node-panel"
      data-node-key={node.id}
      data-kind={node.kind}
      data-expanded={expanded ? "true" : "false"}
      className="group/panel grid min-w-0 content-start gap-3 rounded-md border border-line bg-canvas p-3"
    >
      <header className="grid gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted" data-testid="run-node-kind">{kindLabel(node.kind, t)}</p>
            <h3 data-testid="run-node-title" className="break-words text-base font-semibold">{node.kind === "query" ? kindLabel("query", t) : text.title}</h3>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span data-testid="run-node-state" data-state={node.state}><span aria-hidden="true" className="font-bold">{stateMark[node.state]}</span> {stateLabel(node.state, t)}</span>
              {text.sub && node.kind !== "query" && <span>{text.sub}</span>}
              {node.ms !== undefined && <span data-testid="run-node-ms">{t[RSC.RUNS_PANEL_DURATION_LABEL]}: {formatSeconds(node.ms)}{t[ROOT.COMMON_SECONDS_TEXT]}</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onToggleExpand && (
              <button type="button" data-testid="run-node-expand" aria-pressed={expanded} aria-label={expanded ? t[RSC.RUNS_PANEL_COLLAPSE_BUTTON] : t[RSC.RUNS_PANEL_EXPAND_BUTTON]} title={expanded ? t[RSC.RUNS_PANEL_COLLAPSE_BUTTON] : t[RSC.RUNS_PANEL_EXPAND_BUTTON]} onClick={onToggleExpand} className={cn("rounded border p-1.5", expanded ? "border-accent text-accent" : "border-line text-muted")}>
                {expanded ? <Minimize2 aria-hidden="true" className="h-4 w-4" /> : <Maximize2 aria-hidden="true" className="h-4 w-4" />}
              </button>
            )}
            {onToggleExpand && (
              <button type="button" data-testid="run-node-popout" aria-label={t[RSC.RUNS_PANEL_POPOUT_BUTTON]} title={t[RSC.RUNS_PANEL_POPOUT_BUTTON]} onClick={popout} className="rounded border border-line p-1.5 text-muted">
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <Neighbors label={t[RSC.RUNS_PANEL_INPUTS_LABEL]} nodes={inputs} onSelect={onSelect} t={t} testId="run-node-inputs" />
        <Neighbors label={t[RSC.RUNS_PANEL_OUTPUTS_LABEL]} nodes={outputs} onSelect={onSelect} t={t} testId="run-node-outputs" />
        <DocStatus doc={doc} running={running} t={t} />
      </header>
      <div className="grid gap-3">
        <Body run={run} graph={graph} node={node} doc={doc} running={running} onSelect={onSelect} t={t} />
      </div>
    </aside>
  );
}
