import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PlanProgressLine } from "../../../components/plan-progress";
import type { Texts } from "../../../i18n";
import { useRun } from "../../../lib/run";
import { RSC as ROOT } from "../../../resource";
import { deleteRun } from "../api";
import { RSC as SHARED } from "../resource";
import { LIST_HASH } from "../route";
import { runPhase } from "./phase";
import { RunSummary } from "./summary";
import { RunWorkbench } from "./workbench";
import { RSC } from "./resource";

/**
 * 실행 로그 뷰(상세) 화면: 목록으로 돌아가는 링크, 요약(질의 전체 · 실행 계획 · 한 줄 요약 · 삭제), 그래프 + 노드 상세(RunWorkbench).
 * 진행 중인 실행은 useRun 이 SSE(끊기면 폴링)로 계속 갱신하고, 선택한 노드는 RunWorkbench 가 들고 있어 갱신 중에도 유지된다.
 */
export function RunView({ id, t }: { id: number; t: Texts }) {
  const detail = useRun(id);
  const [failed, setFailed] = useState(false);

  const remove = async () => {
    try {
      await deleteRun(id);
      window.location.hash = LIST_HASH;
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="grid gap-4">
      <a href={LIST_HASH} data-testid="run-back" className="inline-flex items-center gap-1 justify-self-start text-sm text-accent underline">
        <ArrowLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
        {t[RSC.RUNS_VIEW_BACK_BUTTON]}
      </a>
      {failed && <p role="alert" className="text-sm text-danger">{t[ROOT.COMMON_ERROR_ALERT]}</p>}
      {!detail && <p role="status" data-testid="run-loading" className="text-sm text-muted">{t[SHARED.RUNS_LOADING_STATUS]}</p>}
      {detail && (
        <article aria-labelledby="run-heading" className="grid gap-4" data-testid="run-detail" data-status={detail.status}>
          <RunSummary detail={detail} phase={runPhase(detail)} onRemove={() => void remove()} t={t} />
          <PlanProgressLine run={detail} t={t} />
          <RunWorkbench detail={detail} phase={runPhase(detail)} t={t} />
        </article>
      )}
    </div>
  );
}
