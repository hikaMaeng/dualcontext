import type { Texts } from "../../i18n";
import type { RunDetail } from "../../lib/run";
import { planProgressText } from "../plan-labels";
import { RSC } from "./resource";

type Props = { run: Pick<RunDetail, "status" | "plan" | "planProgress">; t: Texts };

/**
 * 계획 진행 줄: 「계획 진행 중: <단계>」(+ 서버가 준 detail). 서버는 계획이 끝나야 plan 을 채우므로
 * 실행이 진행 중이고 plan 이 아직 없고 planProgress 가 있을 때만 보인다. plan 이 채워지면 사라지고 계획 탭이 나타난다.
 */
export function PlanProgressLine({ run, t }: Props) {
  if (run.status !== "running" || run.plan || !run.planProgress) return null;
  const { stage, detail } = run.planProgress;
  return (
    <p role="status" data-testid="plan-progress" data-stage={stage} className="text-sm text-muted">
      {t[RSC.PLAN_PROGRESS_RUNNING_STATUS]}: <span className="text-fg">{planProgressText(stage, t)}</span>
      {detail ? ` · ${detail}` : ""}
    </p>
  );
}
