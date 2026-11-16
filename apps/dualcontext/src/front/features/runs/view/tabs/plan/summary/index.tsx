import type { PlanTrace } from "dualcontext_domain/common";
import { planModeText, planStopText } from "../../../../../../components/plan-labels";
import type { Texts } from "../../../../../../i18n";
import { RSC as ROOT } from "../../../../../../resource";
import { formatSeconds } from "../../../../format";
import { planDepth } from "../model";
import { RSC } from "./resource";

type Props = { plan: PlanTrace; running: boolean; t: Texts };

/**
 * 계획 요약 한 줄: 모드 · 아이템 수 · 단계 수 · 정지 사유 · 소요(계획 자체의 소요). 계획이 끝나도 실행은 답변 단계로 계속될 수 있으므로
 * 실행 상태가 아니라 stop · ms 유무로 판단한다(없으면 진행 중이면 「진행 중」, 아니면 「-」).
 */
export function PlanSummary({ plan, running, t }: Props) {
  const items = plan.items ?? [];
  return (
    <p data-testid="plan-summary" data-mode={plan.mode} data-stop={plan.stop} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <span><span className="text-muted">{t[RSC.RUNS_PLAN_SUMMARY_MODE_LABEL]}: </span>{planModeText(plan.mode, t)}</span>
      <span><span className="text-muted">{t[RSC.RUNS_PLAN_SUMMARY_ITEMS_LABEL]}: </span><span data-testid="plan-summary-items">{items.length}</span></span>
      <span><span className="text-muted">{t[RSC.RUNS_PLAN_SUMMARY_LEVELS_LABEL]}: </span><span data-testid="plan-summary-levels">{planDepth(items)}</span></span>
      <span>
        <span className="text-muted">{t[RSC.RUNS_PLAN_SUMMARY_STOP_LABEL]}: </span>
        <span data-testid="plan-summary-stop">{plan.stop ? planStopText(plan.stop, t) : running ? t[RSC.RUNS_PLAN_SUMMARY_RUNNING_STATUS] : "-"}</span>
      </span>
      <span>
        <span className="text-muted">{t[RSC.RUNS_PLAN_SUMMARY_DURATION_LABEL]}: </span>
        {plan.ms ? `${formatSeconds(plan.ms)}${t[ROOT.COMMON_SECONDS_TEXT]}` : "-"}
      </span>
    </p>
  );
}
