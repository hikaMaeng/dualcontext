import { useState } from "react";
import type { RouterStep, StageConfig } from "dualcontext_domain/common";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Select } from "../../../components/ui/input";
import { Field } from "../../../components/layout";
import type { Texts } from "../../../i18n";
import { StepEditor } from "../step/index";
import { RSC } from "./resource";

/** individual 은 조사원 하나에 붙는 개별 라우터(그 조사원을 쓸지 판정)의 단계 목록이다. */
type StageName = "researcher" | "procedure" | "individual";

/** 새 단계의 시작값. LLM 단계는 이 단계(stage)의 기본 프롬프트로 채운다. */
function newStep(type: RouterStep["type"], prompt: string): RouterStep {
  if (type === "embedding") return { type, topK: 3, minScore: 0.67, margin: 0.05, parts: true, onError: "skip" };
  if (type === "keyword") return { type, topK: 3, parts: true, onError: "none" };
  return { type, topK: 3, prompt, showScores: true, allowNone: true, parts: false, onError: "skip" };
}

type Props = { stage: StageName; config: StageConfig; defaultPrompt: string; t: Texts; onChange: (config: StageConfig) => void };

/** 한 단계(조사원 선택, 프로시저 선택, 또는 조사원 하나의 개별 라우터)의 라우팅 단계 목록 편집. 위에서 아래로 차례로 좁혀 간다. */
export function StageEditor({ stage, config, defaultPrompt, t, onChange }: Props) {
  const [addType, setAddType] = useState<RouterStep["type"]>("llm");
  const heading = stage === "researcher" ? t[RSC.ROUTER_RESEARCHER_HEADING_TEXT] : stage === "procedure" ? t[RSC.ROUTER_PROCEDURE_HEADING_TEXT] : t[RSC.ROUTER_INDIVIDUAL_HEADING_TEXT];
  const replace = (index: number, step: RouterStep) => onChange({ steps: config.steps.map((existing, position) => (position === index ? step : existing)) });
  const move = (index: number, direction: -1 | 1) => {
    const steps = [...config.steps];
    [steps[index], steps[index + direction]] = [steps[index + direction], steps[index]];
    onChange({ steps });
  };

  return (
    <Card role="group" aria-labelledby={`${stage}-heading`}>
      <CardHeader><CardTitle id={`${stage}-heading`}>{heading}</CardTitle></CardHeader>
      <CardContent className="grid gap-3">
        <ol aria-label={t[RSC.ROUTER_STAGE_STEPS_LABEL]} data-testid={`${stage}-steps`} className="grid gap-3">
          {config.steps.map((step, index) => (
            <StepEditor key={index} stage={stage} index={index} total={config.steps.length} step={step} t={t} onChange={(next) => replace(index, next)} onMove={(direction) => move(index, direction)} onRemove={() => onChange({ steps: config.steps.filter((_step, position) => position !== index) })} />
          ))}
        </ol>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t[RSC.ROUTER_STAGE_ADDTYPE_LABEL]}>
            <Select data-testid={`${stage}-addtype`} value={addType} onChange={(e) => setAddType(e.target.value as RouterStep["type"])}>
              <option value="embedding">{t[RSC.ROUTER_STAGE_TYPE_EMBEDDING_TEXT]}</option>
              <option value="keyword">{t[RSC.ROUTER_STAGE_TYPE_KEYWORD_TEXT]}</option>
              <option value="llm">{t[RSC.ROUTER_STAGE_TYPE_LLM_TEXT]}</option>
            </Select>
          </Field>
          <Button type="button" variant="outline" data-testid={`${stage}-addstep`} disabled={config.steps.length >= 6} onClick={() => onChange({ steps: [...config.steps, newStep(addType, defaultPrompt)] })}>{t[RSC.ROUTER_STAGE_ADDSTEP_BUTTON]}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
