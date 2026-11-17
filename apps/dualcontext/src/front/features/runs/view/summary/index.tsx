import { Button } from "../../../../components/ui/button";
import type { Texts } from "../../../../i18n";
import type { RunDetail } from "../../../../lib/run";
import { RSC as ROOT } from "../../../../resource";
import { formatSeconds, formatWhen } from "../../format";
import { RSC as SHARED } from "../../resource";
import { statusText } from "../../status";
import type { RunPhase } from "../phase";
import { RunExecutionPlan } from "./execution";
import { RSC } from "./resource";

type Props = { detail: RunDetail; phase: RunPhase; onRemove: () => void; t: Texts };

/**
 * 뷰 상단 요약. 질의는 잘라내지 않고 줄바꿈해 전부 보이고, 시각 · 상태 · 소요 시간은 한 줄 요약이며,
 * 진행 중이 아닐 때만 삭제 버튼이 있다. 실패 사유는 탭과 무관하게 항상 여기서 보인다.
 */
export function RunSummary({ detail, phase, onRemove, t }: Props) {
  const stage = detail.stage === "answering" ? t[RSC.RUNS_STAGE_ANSWERING_STATUS] : t[RSC.RUNS_STAGE_AUGMENT_STATUS];
  return (
    <header className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="run-heading" className="text-lg font-semibold">{t[RSC.RUNS_DETAIL_HEADING_TEXT]} #{detail.id}</h2>
        {!phase.running && (
          <Button variant="outline" size="sm" className="text-danger" data-testid="run-delete" onClick={onRemove}>{t[ROOT.COMMON_DELETE_BUTTON]}</Button>
        )}
      </div>
      <div>
        <span className="sr-only">{t[SHARED.RUNS_QUERY_LABEL]}</span>
        <p data-testid="run-query" className="whitespace-pre-wrap break-words text-base leading-7">{detail.query}</p>
      </div>
      <RunExecutionPlan settings={detail.settings} tracedMode={detail.plan?.mode ?? null} t={t} />
      <p data-testid="run-meta" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span>{t[SHARED.RUNS_TIME_LABEL]}: <time dateTime={detail.createdAt}>{formatWhen(detail.createdAt)}</time></span>
        <span>
          {t[SHARED.RUNS_STATUS_LABEL]}: <span role="status" data-testid="run-status">{phase.running ? stage : statusText(detail.status, t)}</span>
        </span>
        <span>{t[SHARED.RUNS_DURATION_LABEL]}: {phase.running ? "-" : formatSeconds(detail.durationMs)}</span>
      </p>
      {detail.error && (
        <p role="alert" data-testid="run-error" className="rounded-md border border-line p-3 text-sm text-danger">{t[RSC.RUNS_FAILURE_LABEL]}: {detail.error}</p>
      )}
    </header>
  );
}
