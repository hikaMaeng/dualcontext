import type { PlanItem, PlanStep } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../../i18n";
import { itemName } from "../../../model";
import { dedupeMethodText } from "../method";
import { RSC } from "./resource";

type Seed = Extract<PlanStep, { kind: "seed" }>;

/** top 후보 정리: 어디서 온 후보인지(질의 분석 · 평가의 부족 컨텍스트), 후보 수, 새로 만든 · 올린 · 다시 만들 아이템, 버린 수. */
export function SeedRow({ step, items, t }: { step: Seed; items: PlanItem[]; t: Texts }) {
  const names = (ids: string[]) => (ids.length === 0 ? t[RSC.RUNS_PLAN_STEPS_SEED_NONE_TEXT] : ids.map((id) => itemName(items, id)).join(", "));
  return (
    <dl data-testid="plan-step-seed" data-source={step.source} className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
      <dt className="text-muted">{step.source === "query" ? t[RSC.RUNS_PLAN_STEPS_SEED_SOURCE_QUERY_TEXT] : t[RSC.RUNS_PLAN_STEPS_SEED_SOURCE_EVALUATION_TEXT]}</dt>
      <dd>{t[RSC.RUNS_PLAN_STEPS_SEED_CANDIDATES_LABEL]} {step.candidates.length}: {step.candidates.map((draft) => draft.name).join(", ") || t[RSC.RUNS_PLAN_STEPS_SEED_NONE_TEXT]}</dd>
      <dt className="text-muted">{t[RSC.RUNS_PLAN_STEPS_SEED_METHOD_LABEL]}</dt>
      <dd>{dedupeMethodText(step.method, t, { name: RSC.RUNS_PLAN_STEPS_SEED_METHOD_NAME_TEXT, llm: RSC.RUNS_PLAN_STEPS_SEED_METHOD_LLM_TEXT, fallback: RSC.RUNS_PLAN_STEPS_SEED_METHOD_FALLBACK_TEXT })}</dd>
      <dt className="text-muted">{t[RSC.RUNS_PLAN_STEPS_SEED_CREATED_LABEL]}</dt>
      <dd data-testid="plan-step-seed-created">{names(step.created)}</dd>
      {step.promoted.length > 0 && (<><dt className="text-muted">{t[RSC.RUNS_PLAN_STEPS_SEED_PROMOTED_LABEL]}</dt><dd>{names(step.promoted)}</dd></>)}
      {step.rebuild.length > 0 && (<><dt className="text-muted">{t[RSC.RUNS_PLAN_STEPS_SEED_REBUILD_LABEL]}</dt><dd>{names(step.rebuild)}</dd></>)}
      {step.dropped > 0 && (<><dt className="text-muted">{t[RSC.RUNS_PLAN_STEPS_SEED_DROPPED_LABEL]}</dt><dd>{step.dropped}</dd></>)}
    </dl>
  );
}
