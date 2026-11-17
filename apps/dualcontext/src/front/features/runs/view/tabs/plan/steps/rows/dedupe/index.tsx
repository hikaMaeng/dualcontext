import { ArrowRight } from "lucide-react";
import type { PlanItem, PlanStep } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../../i18n";
import { cn } from "../../../../../../../../lib/utils";
import { itemName } from "../../../model";
import { memberNames } from "../../model";
import { dedupeMethodText } from "../method";
import { RSC } from "./resource";

type Dedupe = Extract<PlanStep, { kind: "dedupe" }>;

/**
 * 한 단계의 사전 요구 후보 전체를 정리한 결과: 후보 몇 개가 몇 개 아이템이 됐는지, 묶음마다 어떤 후보가 어느 아이템이 됐는지
 * (새 아이템 · 기존 아이템에 합침 · 상한으로 만들지 못함)와 그 후보를 낸 아이템.
 */
export function DedupeRow({ step, items, t }: { step: Dedupe; items: PlanItem[]; t: Texts }) {
  return (
    <div data-testid="plan-step-dedupe" data-level={step.level} className="grid gap-1">
      <p className="text-muted">
        {t[RSC.RUNS_PLAN_STEPS_DEDUPE_METHOD_LABEL]}: {dedupeMethodText(step.method, t, { name: RSC.RUNS_PLAN_STEPS_DEDUPE_METHOD_NAME_TEXT, llm: RSC.RUNS_PLAN_STEPS_DEDUPE_METHOD_LLM_TEXT, fallback: RSC.RUNS_PLAN_STEPS_DEDUPE_METHOD_FALLBACK_TEXT })}
        {" · "}{t[RSC.RUNS_PLAN_STEPS_DEDUPE_SUMMARY_LABEL]}: {step.candidates.length} / {step.groups.length}
      </p>
      <ul className="grid gap-1">
        {step.groups.map((group, index) => {
          const owners = [...new Set(group.members.map((member) => step.candidates[member]?.owner).filter((owner): owner is string => owner !== undefined))];
          return (
            <li key={index} data-testid="plan-step-dedupe-group" className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{memberNames(step.candidates, group.members).join(", ")}</span>
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted rtl:rotate-180" />
              <strong className="text-fg">{group.target ? itemName(items, group.target) : "-"}</strong>
              <span className={cn("rounded border px-1.5 text-xs", group.target === null ? "border-danger text-danger" : group.existing ? "border-line text-muted" : "border-accent text-accent")}>
                {group.target === null ? t[RSC.RUNS_PLAN_STEPS_DEDUPE_SKIPPED_TEXT] : group.existing ? t[RSC.RUNS_PLAN_STEPS_DEDUPE_EXISTING_TEXT] : t[RSC.RUNS_PLAN_STEPS_DEDUPE_NEW_TEXT]}
              </span>
              {owners.length > 0 && <span className="text-xs text-muted">{t[RSC.RUNS_PLAN_STEPS_DEDUPE_OWNERS_LABEL]}: {owners.map((owner) => itemName(items, owner)).join(", ")}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
