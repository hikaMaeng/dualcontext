import type { ContextMode } from "dualcontext_domain/common";
import { CONTEXT_MODES, planModeMessage, planModeText } from "../../../components/plan-labels";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import type { Texts } from "../../../i18n";
import { RSC } from "./resource";

type Props = { mode: ContextMode; t: Texts; onChange: (mode: ContextMode) => void };

/** 모드 3택. 라디오마다 한 줄 설명이 붙고 설명은 aria-describedby 로 라디오의 설명이 된다. */
export function ModeChoice({ mode, t, onChange }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle id="plan-mode-heading">{t[RSC.PLAN_MODE_HEADING_TEXT]}</CardTitle></CardHeader>
      <CardContent>
        <fieldset className="grid gap-2" aria-labelledby="plan-mode-heading" data-testid="plan-mode">
          {CONTEXT_MODES.map((value) => (
            <label key={value} className="flex items-start gap-2 rounded-md border border-line p-3 text-sm">
              <input
                type="radio"
                name="plan-mode"
                value={value}
                checked={mode === value}
                onChange={() => onChange(value)}
                aria-describedby={`plan-mode-${value}-hint`}
                data-testid={`plan-mode-${value}`}
                className="mt-1 accent-[var(--color-accent)]"
              />
              <span className="grid gap-0.5">
                <span className="font-medium text-fg">{planModeText(value, t)}</span>
                <span id={`plan-mode-${value}-hint`} className="text-muted">{planModeMessage(value, t)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
}
