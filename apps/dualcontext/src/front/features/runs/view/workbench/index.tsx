import { useMemo, useState } from "react";
import type { Texts } from "../../../../i18n";
import type { RunDetail } from "../../../../lib/run";
import { RunCanvas } from "./canvas";
import { buildRunGraph, nodeOf } from "./model";
import { NodePanel } from "./panel";
import type { RunPhase } from "../phase";
import { RSC } from "./resource";

type Props = { detail: RunDetail; phase: RunPhase; t: Texts };

/**
 * 실행 로그 상세의 본체: 왼쪽 그래프 캔버스 + 오른쪽 노드 상세 패널(좁은 화면에서는 위아래).
 * 선택한 노드는 이 컴포넌트가 들고 있어 실행이 SSE 로 갱신돼도 유지된다. 아직 고르지 않았으면 최종 답변 노드를 보인다
 * (진행 중이라 최종 답변이 생기기 전에는 마지막으로 생긴 노드). 선택한 노드가 사라지면 같은 기본 선택으로 돌아간다.
 * 패널 확대는 캔버스 : 패널 폭을 2 : 3 으로 바꾸고 긴 본문의 높이 제한을 푼다. 더 크게는 「새 창으로 열기」(노드 하나만 전체 화면).
 */
export function RunWorkbench({ detail, phase, t }: Props) {
  const graph = useMemo(() => buildRunGraph(detail), [detail]);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const effective = selected !== null && nodeOf(graph, selected) ? selected : graph.finalId;

  return (
    <section
      aria-label={t[RSC.RUNS_WORKBENCH_LABEL]}
      data-testid="run-workbench"
      data-expanded={expanded ? "true" : "false"}
      className={expanded ? "grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : "grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]"}
    >
      <RunCanvas graph={graph} query={detail.query} selectedId={effective} onSelect={setSelected} t={t} />
      <div className="min-w-0 lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:overflow-auto">
        <NodePanel run={detail} graph={graph} nodeId={effective} running={phase.running} expanded={expanded} onToggleExpand={() => setExpanded((value) => !value)} onSelect={setSelected} t={t} />
      </div>
    </section>
  );
}
