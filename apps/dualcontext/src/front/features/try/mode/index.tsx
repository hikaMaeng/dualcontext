import { useEffect, useState } from "react";
import type { ContextMode, ContextPlanConfig } from "dualcontext_domain/common";
import { Field } from "../../../components/layout";
import { CONTEXT_MODES, planModeMessage, planModeText } from "../../../components/plan-labels";
import { Select } from "../../../components/ui/input";
import type { Texts } from "../../../i18n";
import { api } from "../../../lib/api";
import { RSC } from "./resource";

/** "" 은 「저장 설정 따름」(POST /augment 에 mode 를 보내지 않는다). */
export type ModeOverride = ContextMode | "";

type Props = { value: ModeOverride; t: Texts; onChange: (value: ModeOverride) => void };

/**
 * 이번 실행의 컨텍스트 모드. 기본은 저장된 계획 설정을 따르고(그 모드 이름을 함께 보인다), 셋 중 하나를 고르면 이번 실행에만 적용된다.
 * 저장 설정을 읽지 못해도 선택은 된다(따름 항목에 모드 이름만 빠진다).
 */
export function ModeSelect({ value, t, onChange }: Props) {
  const [saved, setSaved] = useState<ContextMode | null>(null);

  useEffect(() => {
    api<ContextPlanConfig>("/plan/config").then((config) => setSaved(config.mode)).catch(() => setSaved(null));
  }, []);

  const effective = value === "" ? saved : value;
  return (
    <div className="grid gap-1">
      <Field label={t[RSC.TRY_MODE_LABEL]}>
        <Select data-testid="try-mode" value={value} aria-describedby="try-mode-hint" onChange={(e) => onChange(e.target.value as ModeOverride)}>
          <option value="">{saved === null ? t[RSC.TRY_MODE_SAVED_TEXT] : `${t[RSC.TRY_MODE_SAVED_TEXT]} (${planModeText(saved, t)})`}</option>
          {CONTEXT_MODES.map((mode) => <option key={mode} value={mode}>{planModeText(mode, t)}</option>)}
        </Select>
      </Field>
      <p id="try-mode-hint" data-testid="try-mode-hint" className="text-xs text-muted">{effective === null ? "" : planModeMessage(effective, t)}</p>
    </div>
  );
}
