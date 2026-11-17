import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import type { Texts } from "../../../../i18n";
import { useRun } from "../../../../lib/run";
import { RSC as SHARED } from "../../resource";
import { LIST_HASH, nodeHash, viewHash } from "../../route";
import { buildRunGraph } from "../workbench/model";
import { NodePanel } from "../workbench/panel";
import { runPhase } from "../phase";
import { RSC } from "./resource";

/**
 * 노드 하나만 전체 화면으로 보는 화면(`#runs/<id>/node/<키>`). 「새 창으로 열기」가 연다.
 * 자기 useRun 으로 SSE 를 받아 진행 중에도 갱신되고, 패널은 늘 확대 상태다. 다른 노드 링크를 누르면 이 화면 안에서 그 노드로 옮긴다.
 */
export function NodeScreen({ id, nodeKey, t }: { id: number; nodeKey: string; t: Texts }) {
  const detail = useRun(id);
  const graph = useMemo(() => (detail ? buildRunGraph(detail) : null), [detail]);
  return (
    <div className="grid gap-4" data-testid="run-node-screen">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <a href={viewHash(id)} data-testid="run-node-screen-to-run" className="inline-flex items-center gap-1 text-accent underline">
          <ArrowLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
          {t[RSC.RUNS_NODESCREEN_TO_RUN_LINK]} #{id}
        </a>
        <a href={LIST_HASH} className="text-accent underline">{t[SHARED.RUNS_TITLE_TEXT]}</a>
      </p>
      {!detail && <p role="status" className="text-sm text-muted">{t[SHARED.RUNS_LOADING_STATUS]}</p>}
      {detail && graph && (
        <>
          <p data-testid="run-node-screen-query" className="whitespace-pre-wrap break-words text-base leading-7">{detail.query}</p>
          <NodePanel run={detail} graph={graph} nodeId={nodeKey} running={runPhase(detail).running} expanded onSelect={(next) => { window.location.hash = nodeHash(id, next); }} t={t} />
        </>
      )}
    </div>
  );
}
