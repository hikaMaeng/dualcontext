import type { PlanStep } from "dualcontext_domain/common";
import { AnalyzeRow } from "../../rows/analyze";
import { SeedRow } from "../../rows/seed";
import { CallList } from "../../parts/calls";
import { DecomposeMap } from "../../parts/decompose-map";
import { RSC as MAP } from "../../parts/decompose-map/resource";
import { DedupeCalls } from "../../parts/dedupe-calls";
import { Section } from "../../parts/section";
import { TextBox } from "../../parts/text-box";
import type { KindProps } from "../../types";
import { reconstructAnalyzePrompt } from "./prompt";
import { RSC } from "./resource";

/**
 * 질의 분해 노드: 모델이 뽑은 핵심 컨텍스트 후보(이름 · 설명), 분해 질의별 필요 컨텍스트(어느 후보가 무엇으로 합쳐졌는가),
 * 후보를 정리한 결과(중복 제거 방법 · 만든 / 올린 / 버린 아이템), 사용한 프롬프트와 모델 응답 원문.
 * 호출 기록이 없는 옛 실행은 스냅샷의 프롬프트 템플릿으로 질의 분해 프롬프트를 재구성해 보인다(재구성이라고 밝힌다).
 */
export function AnalyzeBody({ run, doc, onSelect, t }: KindProps) {
  const steps = run.plan?.steps;
  const analyze = steps?.find((step): step is Extract<PlanStep, { kind: "analyze" }> => step.kind === "analyze");
  const seed = steps?.find((step): step is Extract<PlanStep, { kind: "seed" }> => step.kind === "seed" && step.round === 0);
  const calls = doc.doc?.calls ?? [];
  const rebuilt = calls.length === 0 ? reconstructAnalyzePrompt(run.settings, run.query, run.plan?.limits.maxItems) : null;
  return (
    <>
      <Section title={t[RSC.RUNS_NODE_ANALYZE_RESULT_LABEL]} testId="run-node-analyze-result">
        {analyze ? <AnalyzeRow drafts={analyze.drafts} error={analyze.error} t={t} /> : <p className="text-muted">{t[RSC.RUNS_NODE_ANALYZE_STEPS_NONE_MESSAGE]}</p>}
      </Section>
      {run.plan && steps && (
        <Section title={t[MAP.RUNS_NODE_ANALYZE_MAP_LABEL]} testId="run-node-analyze-map">
          <DecomposeMap items={run.plan.items} steps={steps} onSelect={onSelect} t={t} />
        </Section>
      )}
      <Section title={t[RSC.RUNS_NODE_ANALYZE_SEED_LABEL]} testId="run-node-analyze-seed">
        {seed ? <SeedRow step={seed} items={run.plan?.items ?? []} t={t} /> : <p className="text-muted">{t[RSC.RUNS_NODE_ANALYZE_STEPS_NONE_MESSAGE]}</p>}
      </Section>
      {rebuilt !== null ? (
        <Section title={t[RSC.RUNS_NODE_ANALYZE_PROMPT_LABEL]} testId="run-node-analyze-prompt">
          <p className="text-muted">{t[RSC.RUNS_NODE_ANALYZE_PROMPT_RECONSTRUCTED_MESSAGE]}</p>
          <TextBox text={rebuilt} testId="run-analyze-prompt-reconstructed" />
        </Section>
      ) : (
        <CallList calls={calls} testId="run-node-analyze-calls" t={t} />
      )}
      <DedupeCalls run={run} round={0} title={t[RSC.RUNS_NODE_ANALYZE_DEDUPE_LABEL]} t={t} />
    </>
  );
}
