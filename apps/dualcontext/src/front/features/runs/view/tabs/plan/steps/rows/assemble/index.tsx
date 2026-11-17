import type { PlanItem, PlanStep } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../../i18n";
import { itemName } from "../../../model";
import { RSC } from "./resource";

type Assemble = Extract<PlanStep, { kind: "assemble" }>;

/** 조립: 최종 컨텍스트에 실린 1차 아이템과 전체 길이. */
export function AssembleRow({ step, items, t }: { step: Assemble; items: PlanItem[]; t: Texts }) {
  return (
    <p data-testid="plan-step-assemble">
      {t[RSC.RUNS_PLAN_STEPS_ASSEMBLE_ITEMS_LABEL]}: {step.items.length === 0 ? t[RSC.RUNS_PLAN_STEPS_ASSEMBLE_NONE_TEXT] : step.items.map((id) => itemName(items, id)).join(", ")}
      <span className="ms-3 text-muted">{t[RSC.RUNS_PLAN_STEPS_ASSEMBLE_CHARS_LABEL]}: {step.chars}</span>
    </p>
  );
}
