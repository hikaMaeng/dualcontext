import type { PlanItem, PlanStep } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../i18n";
import { RSC as ROOT } from "../../../../../../../resource";
import { formatSeconds } from "../../../../../format";
import { itemName } from "../../../model/items";
import { RSC } from "./resource";

type Prerequisites = Extract<PlanStep, { kind: "prerequisites" }>;

/** 아이템 하나의 사전 요구 분석: 이 아이템이 먼저 있어야 한다고 본 컨텍스트 후보. 실패하면 사전 요구 없이 진행했다. */
export function PrerequisitesRow({ step, items, t }: { step: Prerequisites; items: PlanItem[]; t: Texts }) {
  return (
    <div data-testid="plan-step-prerequisites" data-item-id={step.item} className="grid gap-0.5">
      <p>
        <strong className="text-fg">{itemName(items, step.item)}</strong>
        <span className="ms-2 text-xs text-muted">{formatSeconds(step.ms)}{t[ROOT.COMMON_SECONDS_TEXT]}</span>
      </p>
      {step.error ? (
        <p role="alert" className="text-danger">{t[RSC.RUNS_PLAN_STEPS_PREREQUISITES_ERROR_LABEL]}: {step.error}</p>
      ) : (
        <p className="text-muted">
          {t[RSC.RUNS_PLAN_STEPS_PREREQUISITES_NEEDS_LABEL]}: {step.drafts.length === 0 ? t[RSC.RUNS_PLAN_STEPS_PREREQUISITES_NONE_TEXT] : step.drafts.map((draft) => draft.name).join(", ")}
        </p>
      )}
    </div>
  );
}
