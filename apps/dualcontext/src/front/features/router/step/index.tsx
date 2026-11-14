import type { RouterStep, StepOnError } from "dualcontext_domain/common";
import { Button } from "../../../components/ui/button";
import { Checkbox, Input, Select, Textarea } from "../../../components/ui/input";
import { Field } from "../../../components/layout";
import type { Texts } from "../../../i18n";
import { RSC as SHARED } from "../../../resource";
import { RSC } from "./resource";

type Props = {
  /** 단계가 속한 단계(stage) 이름. 시험·접근성 이름이 단계끼리 겹치지 않게 하는 데만 쓴다. */
  stage: string;
  index: number;
  total: number;
  step: RouterStep;
  t: Texts;
  onChange: (step: RouterStep) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

const typeTexts = {
  embedding: RSC.ROUTER_STEP_TYPE_EMBEDDING_TEXT,
  keyword: RSC.ROUTER_STEP_TYPE_KEYWORD_TEXT,
  llm: RSC.ROUTER_STEP_TYPE_LLM_TEXT
} as const;

/** 라우팅 단계 하나의 편집 폼. 종류마다 다른 항목(임베딩: 최소 유사도·마진, LLM: 프롬프트)을 보인다. */
export function StepEditor({ stage, index, total, step, t, onChange, onMove, onRemove }: Props) {
  const id = `${stage}-step-${index}`;
  const set = <K extends string>(field: K, value: unknown) => onChange({ ...step, [field]: value } as RouterStep);

  return (
    <li role="group" aria-labelledby={`${id}-heading`} data-testid={id} className="grid gap-3 rounded-md border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-heading`} className="text-sm font-semibold">{t[RSC.ROUTER_STEP_HEADING_TEXT]} {index + 1} · {t[typeTexts[step.type]]}</h3>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => onMove(-1)}>{t[RSC.ROUTER_STEP_MOVEUP_BUTTON]}</Button>
          <Button type="button" variant="outline" size="sm" disabled={index === total - 1} onClick={() => onMove(1)}>{t[RSC.ROUTER_STEP_MOVEDOWN_BUTTON]}</Button>
          <Button type="button" variant="outline" size="sm" disabled={total <= 1} onClick={onRemove}>{t[RSC.ROUTER_STEP_REMOVE_BUTTON]}</Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t[RSC.ROUTER_STEP_TYPE_LABEL]}>
          <Select data-testid={`${id}-type`} value={step.type} disabled>
            {(Object.keys(typeTexts) as (keyof typeof typeTexts)[]).map((type) => <option key={type} value={type}>{t[typeTexts[type]]}</option>)}
          </Select>
        </Field>
        <Field label={t[SHARED.COMMON_TOPK_LABEL]}>
          <Input data-testid={`${id}-topk`} type="number" min={1} max={20} value={step.topK} onChange={(e) => set("topK", Number(e.target.value))} />
        </Field>
        <Field label={t[RSC.ROUTER_STEP_ONERROR_LABEL]}>
          <Select data-testid={`${id}-onerror`} value={step.onError} onChange={(e) => set("onError", e.target.value as StepOnError)}>
            <option value="skip">{t[RSC.ROUTER_STEP_ONERROR_SKIP_TEXT]}</option>
            <option value="keyword">{t[RSC.ROUTER_STEP_ONERROR_KEYWORD_TEXT]}</option>
            <option value="none">{t[RSC.ROUTER_STEP_ONERROR_NONE_TEXT]}</option>
          </Select>
        </Field>
      </div>
      {step.type === "embedding" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t[RSC.ROUTER_STEP_MINSCORE_LABEL]}>
            <Input data-testid={`${id}-minscore`} type="number" min={0} max={1} step={0.01} value={step.minScore} onChange={(e) => set("minScore", Number(e.target.value))} />
          </Field>
          <Field label={t[RSC.ROUTER_STEP_MARGIN_LABEL]}>
            <Input data-testid={`${id}-margin`} type="number" min={0} max={1} step={0.01} value={step.margin} onChange={(e) => set("margin", Number(e.target.value))} />
          </Field>
        </div>
      )}
      {step.type === "llm" && (
        <>
          <div className="flex flex-wrap gap-4 text-sm text-muted">
            <label className="flex items-center gap-2"><Checkbox data-testid={`${id}-showscores`} checked={step.showScores} onChange={(e) => set("showScores", e.target.checked)} />{t[RSC.ROUTER_STEP_SHOWSCORES_LABEL]}</label>
            <label className="flex items-center gap-2"><Checkbox data-testid={`${id}-allownone`} checked={step.allowNone} onChange={(e) => set("allowNone", e.target.checked)} />{t[RSC.ROUTER_STEP_ALLOWNONE_LABEL]}</label>
          </div>
          <Field label={t[RSC.ROUTER_STEP_PROMPT_LABEL]}>
            <Textarea data-testid={`${id}-prompt`} className="min-h-40" value={step.prompt} onChange={(e) => set("prompt", e.target.value)} />
          </Field>
        </>
      )}
      <label className="flex items-center gap-2 text-sm text-muted">
        <Checkbox data-testid={`${id}-parts`} checked={step.parts} onChange={(e) => set("parts", e.target.checked)} />
        {t[RSC.ROUTER_STEP_PARTS_LABEL]}
      </label>
    </li>
  );
}
