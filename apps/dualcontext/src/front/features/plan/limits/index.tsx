import type { ContextPlanConfig } from "dualcontext_domain/common";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input, Select } from "../../../components/ui/input";
import { Field } from "../../../components/layout";
import type { Texts } from "../../../i18n";
import { RSC } from "./resource";

type Limits = Pick<ContextPlanConfig, "maxLevels" | "maxNeedsPerItem" | "maxItems" | "maxProvidedChars" | "dedupe">;
type Props = { config: Limits; t: Texts; onChange: (patch: Partial<Limits>) => void };

/** 분해 한도: 단계 수 · 아이템당 사전 아이템 수 · 전체 아이템 수 · 사전 컨텍스트 반영 글자 수와 중복 정리 방법. 범위는 계약(plan/index.ts) 주석과 같다. */
export function LimitsEditor({ config, t, onChange }: Props) {
  return (
    <Card role="group" aria-labelledby="plan-limits-heading">
      <CardHeader><CardTitle id="plan-limits-heading">{t[RSC.PLAN_LIMITS_HEADING_TEXT]}</CardTitle></CardHeader>
      <CardContent className="grid gap-3">
        <p className="max-w-3xl text-sm text-muted">{t[RSC.PLAN_LIMITS_HINT_MESSAGE]}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t[RSC.PLAN_LIMITS_MAXLEVELS_LABEL]}>
            <Input data-testid="plan-maxlevels" type="number" min={1} max={6} value={config.maxLevels} onChange={(e) => onChange({ maxLevels: Number(e.target.value) })} />
          </Field>
          <Field label={t[RSC.PLAN_LIMITS_MAXNEEDS_LABEL]}>
            <Input data-testid="plan-maxneeds" type="number" min={1} max={8} value={config.maxNeedsPerItem} onChange={(e) => onChange({ maxNeedsPerItem: Number(e.target.value) })} />
          </Field>
          <Field label={t[RSC.PLAN_LIMITS_MAXITEMS_LABEL]}>
            <Input data-testid="plan-maxitems" type="number" min={1} max={40} value={config.maxItems} onChange={(e) => onChange({ maxItems: Number(e.target.value) })} />
          </Field>
          <Field label={t[RSC.PLAN_LIMITS_MAXPROVIDEDCHARS_LABEL]}>
            <Input
              data-testid="plan-max-provided-chars"
              type="number"
              min={500}
              max={20000}
              step={100}
              aria-describedby="plan-max-provided-chars-hint"
              value={config.maxProvidedChars}
              onChange={(e) => onChange({ maxProvidedChars: Number(e.target.value) })}
            />
          </Field>
          <Field label={t[RSC.PLAN_LIMITS_DEDUPE_LABEL]}>
            <Select data-testid="plan-dedupe" value={config.dedupe} onChange={(e) => onChange({ dedupe: e.target.value as Limits["dedupe"] })}>
              <option value="name">{t[RSC.PLAN_LIMITS_DEDUPE_NAME_TEXT]}</option>
              <option value="llm">{t[RSC.PLAN_LIMITS_DEDUPE_LLM_TEXT]}</option>
            </Select>
          </Field>
        </div>
        <p id="plan-max-provided-chars-hint" className="max-w-3xl text-xs text-muted">{t[RSC.PLAN_LIMITS_MAXPROVIDEDCHARS_MESSAGE]}</p>
      </CardContent>
    </Card>
  );
}
