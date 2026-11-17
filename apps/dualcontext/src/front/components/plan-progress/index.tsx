import type { Texts } from "../../i18n";
import type { RunDetail } from "../../lib/run";
import { planProgressText } from "../plan-labels";
import { RSC } from "./resource";

type Props = { run: Pick<RunDetail, "status" | "plan" | "planProgress">; t: Texts };

/**
 * 계획 진행 줄: 「계획 진행 중: <단계>」(+ 서버가 준 detail). 실행이 진행 중이고 planProgress 가 있고
 * 계획이 아직 멈추지 않았을 때(plan 이 없거나 부분 trace 라 stop 이 null)만 보인다. 계획이 멈추면(plan.stop 있음) 사라진다.
 * 계획 탭은 부분 trace 가 생기는 첫 단계 뒤부터 나타나 이 줄과 함께 보인다.
 */
export function PlanProgressLine({ run, t }: Props) {
  if (run.status !== "running" || !run.planProgress || (run.plan && run.plan.stop)) return null;
  const { stage, detail } = run.planProgress;
  return (
    <p role="status" data-testid="plan-progress" data-stage={stage} className="text-sm text-muted">
      {t[RSC.PLAN_PROGRESS_RUNNING_STATUS]}: <span className="text-fg">{planProgressText(stage, t)}</span>
      {detail ? ` · ${detail}` : ""}
    </p>
  );
}
