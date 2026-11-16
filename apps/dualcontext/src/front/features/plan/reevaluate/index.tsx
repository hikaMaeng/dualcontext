import type { ContextPlanConfig } from "dualcontext_domain/common";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Field } from "../../../components/layout";
import type { Texts } from "../../../i18n";
import { cn } from "../../../lib/utils";
import { RSC } from "./resource";

type Reevaluate = ContextPlanConfig["reevaluate"];
type Props = { config: Reevaluate; active: boolean; t: Texts; onChange: (patch: Partial<Reevaluate>) => void };

/**
 * 재평가 설정. 저장된 모드가 reevaluate 가 아니어도 보이고 편집할 수 있다(시험 실행에서 재평가 모드를 고르면 이 값이 쓰인다).
 * 그때는 「지금 모드에서는 쓰이지 않는다」는 안내를 보이고 흐리게 그린다.
 */
export function ReevaluateEditor({ config, active, t, onChange }: Props) {
  return (
    <Card role="group" aria-labelledby="plan-reeval-heading" data-testid="plan-reeval" data-active={active}>
      <CardHeader><CardTitle id="plan-reeval-heading">{t[RSC.PLAN_REEVAL_HEADING_TEXT]}</CardTitle></CardHeader>
      <CardContent className="grid gap-3">
        <p className="max-w-3xl text-sm text-muted">{t[RSC.PLAN_REEVAL_HINT_MESSAGE]}</p>
        {!active && <p role="note" data-testid="plan-reeval-inactive" className="max-w-3xl rounded-md border border-line p-2 text-sm text-muted">{t[RSC.PLAN_REEVAL_INACTIVE_MESSAGE]}</p>}
        <div className={cn("grid gap-3 sm:grid-cols-4", !active && "opacity-60")}>
          <Field label={t[RSC.PLAN_REEVAL_MAXROUNDS_LABEL]}>
            <Input data-testid="plan-reeval-maxrounds" type="number" min={0} max={5} value={config.maxRounds} onChange={(e) => onChange({ maxRounds: Number(e.target.value) })} />
          </Field>
          <Field label={t[RSC.PLAN_REEVAL_PASSSCORE_LABEL]}>
            <Input data-testid="plan-reeval-passscore" type="number" min={0} max={100} value={config.passScore} onChange={(e) => onChange({ passScore: Number(e.target.value) })} />
          </Field>
          <Field label={t[RSC.PLAN_REEVAL_MAXMISSING_LABEL]}>
            <Input data-testid="plan-reeval-maxmissing" type="number" min={0} value={config.maxMissing} onChange={(e) => onChange({ maxMissing: Number(e.target.value) })} />
          </Field>
          <Field label={t[RSC.PLAN_REEVAL_MAXNEWITEMS_LABEL]}>
            <Input data-testid="plan-reeval-maxnewitems" type="number" min={1} max={8} value={config.maxNewItems} onChange={(e) => onChange({ maxNewItems: Number(e.target.value) })} />
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}
