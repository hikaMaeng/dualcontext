import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Textarea } from "../../../components/ui/input";
import type { Texts } from "../../../i18n";
import { PROMPT_KEYS, type PlanPrompts, type PromptKey } from "../api";
import { RSC } from "./resource";

type Props = { prompts: PlanPrompts; defaults: PlanPrompts; t: Texts; onChange: (key: PromptKey, value: string) => void };

/** 프롬프트 키마다 레이블 · 설명 · 「기본값으로」 버튼 이름. 키가 늘면 Record 가 컴파일 오류로 알려 준다. */
const labels: Record<PromptKey, { label: RSC; hint: RSC; reset: RSC }> = {
  analyze: { label: RSC.PLAN_PROMPTS_ANALYZE_LABEL, hint: RSC.PLAN_PROMPTS_ANALYZE_MESSAGE, reset: RSC.PLAN_PROMPTS_ANALYZE_RESET_BUTTON },
  prerequisites: { label: RSC.PLAN_PROMPTS_PREREQUISITES_LABEL, hint: RSC.PLAN_PROMPTS_PREREQUISITES_MESSAGE, reset: RSC.PLAN_PROMPTS_PREREQUISITES_RESET_BUTTON },
  dedupe: { label: RSC.PLAN_PROMPTS_DEDUPE_LABEL, hint: RSC.PLAN_PROMPTS_DEDUPE_MESSAGE, reset: RSC.PLAN_PROMPTS_DEDUPE_RESET_BUTTON },
  evaluate: { label: RSC.PLAN_PROMPTS_EVALUATE_LABEL, hint: RSC.PLAN_PROMPTS_EVALUATE_MESSAGE, reset: RSC.PLAN_PROMPTS_EVALUATE_RESET_BUTTON }
};

/** 단계별 프롬프트 4종. 「기본값으로」는 /plan/defaults 의 프롬프트로 그 칸만 되돌린다(저장은 저장 버튼). */
export function PromptsEditor({ prompts, defaults, t, onChange }: Props) {
  return (
    <Card role="group" aria-labelledby="plan-prompts-heading">
      <CardHeader><CardTitle id="plan-prompts-heading">{t[RSC.PLAN_PROMPTS_HEADING_TEXT]}</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <p className="max-w-3xl text-sm text-muted">{t[RSC.PLAN_PROMPTS_HINT_MESSAGE]}</p>
        {PROMPT_KEYS.map((key) => (
          <div key={key} className="grid gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`plan-prompt-${key}`} className="text-sm text-muted">{t[labels[key].label]}</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid={`plan-prompt-${key}-reset`}
                disabled={prompts[key] === defaults[key]}
                onClick={() => onChange(key, defaults[key])}
              >
                {t[labels[key].reset]}
              </Button>
            </div>
            <p id={`plan-prompt-${key}-hint`} className="text-xs text-muted">{t[labels[key].hint]}</p>
            <Textarea
              id={`plan-prompt-${key}`}
              data-testid={`plan-prompt-${key}`}
              aria-describedby={`plan-prompt-${key}-hint`}
              className="min-h-48"
              value={prompts[key]}
              onChange={(e) => onChange(key, e.target.value)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
