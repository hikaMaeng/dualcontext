import type { PlanStep } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../../i18n";
import { cn } from "../../../../../../../../lib/utils";
import { RSC } from "./resource";

type Evaluate = Extract<PlanStep, { kind: "evaluate" }>;

/** 답변 평가: 점수 · 통과 여부 · 부족하다고 본 컨텍스트 수(이름과 이유는 아래 「재평가 라운드」), 또는 실패 사유. */
export function EvaluateRow({ step, t }: { step: Evaluate; t: Texts }) {
  if (step.error) return <p data-testid="plan-step-evaluate" role="alert" className="text-danger">{t[RSC.RUNS_PLAN_STEPS_EVALUATE_ERROR_LABEL]}: {step.error}</p>;
  return (
    <p data-testid="plan-step-evaluate" data-pass={String(step.pass)} className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span>{t[RSC.RUNS_PLAN_STEPS_EVALUATE_SCORE_LABEL]}: {step.score}</span>
      <span className={cn("rounded border px-1.5 text-xs", step.pass ? "border-accent text-accent" : "border-danger text-danger")}>{step.pass ? t[RSC.RUNS_PLAN_STEPS_EVALUATE_PASS_TEXT] : t[RSC.RUNS_PLAN_STEPS_EVALUATE_FAIL_TEXT]}</span>
      <span className="text-muted">{t[RSC.RUNS_PLAN_STEPS_EVALUATE_MISSING_LABEL]}: {step.missing}</span>
    </p>
  );
}
