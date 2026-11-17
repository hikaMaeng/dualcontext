import type { PlanItem, PlanStep } from "dualcontext_domain/common";
import { itemStatusText } from "../../../../../../../../components/plan-labels";
import type { Texts } from "../../../../../../../../i18n";
import { cn } from "../../../../../../../../lib/utils";
import { RSC as ROOT } from "../../../../../../../../resource";
import { formatSeconds } from "../../../../../../format";
import { itemName } from "../../../model";
import { RSC } from "./resource";

type Build = Extract<PlanStep, { kind: "build" }>;

const tone: Record<string, string> = { built: "border-accent text-accent", empty: "border-line text-muted", error: "border-danger text-danger", pending: "border-line text-muted" };

/** 아이템 컨텍스트 생성: 결과 상태 · 길이 · 소요, 그리고 사전 컨텍스트로 건네받은 아이템(원문 길이)과 오류. */
export function BuildRow({ step, items, t }: { step: Build; items: PlanItem[]; t: Texts }) {
  return (
    <div data-testid="plan-step-build" data-item-id={step.item} data-status={step.status} className="grid gap-0.5">
      <p className="flex flex-wrap items-center gap-2">
        <strong className="text-fg">{itemName(items, step.item)}</strong>
        <span className={cn("rounded border px-1.5 text-xs", tone[step.status] ?? tone.pending)}>{itemStatusText(step.status, t)}</span>
        <span className="text-xs text-muted">{formatSeconds(step.ms)}{t[ROOT.COMMON_SECONDS_TEXT]}</span>
        <span className="text-xs text-muted">{t[RSC.RUNS_PLAN_STEPS_BUILD_CHARS_LABEL]}: {step.contextChars}</span>
      </p>
      <p className="text-muted">
        {t[RSC.RUNS_PLAN_STEPS_BUILD_PROVIDED_LABEL]}: {step.provided.length === 0 ? t[RSC.RUNS_PLAN_STEPS_BUILD_NONE_TEXT] : step.provided.map((entry) => `${itemName(items, entry.item)} (${entry.chars})`).join(", ")}
      </p>
      {step.error && <p role="alert" className="text-danger">{t[RSC.RUNS_PLAN_STEPS_BUILD_ERROR_LABEL]}: {step.error}</p>}
    </div>
  );
}
