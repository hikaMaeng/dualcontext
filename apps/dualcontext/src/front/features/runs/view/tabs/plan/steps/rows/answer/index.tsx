import type { PlanStep } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../../i18n";
import { RSC } from "./resource";

type Answer = Extract<PlanStep, { kind: "answer" }>;

/** 답변 생성: 길이(본문은 아래 「재평가 라운드」에서 본다) 또는 실패 사유. */
export function AnswerRow({ step, t }: { step: Answer; t: Texts }) {
  return step.error ? (
    <p data-testid="plan-step-answer" role="alert" className="text-danger">{t[RSC.RUNS_PLAN_STEPS_ANSWER_ERROR_LABEL]}: {step.error}</p>
  ) : (
    <p data-testid="plan-step-answer">{t[RSC.RUNS_PLAN_STEPS_ANSWER_CHARS_LABEL]}: {step.chars}</p>
  );
}
