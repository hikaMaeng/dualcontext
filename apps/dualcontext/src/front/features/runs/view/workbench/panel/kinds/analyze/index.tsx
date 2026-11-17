import type { PlanStep } from "dualcontext_domain/common";
import { AnalyzeRow } from "../../rows/analyze";
import { SeedRow } from "../../rows/seed";
import { CallList } from "../../parts/calls";
import { DedupeCalls } from "../../parts/dedupe-calls";
import { Section } from "../../parts/section";
import type { KindProps } from "../../types";
import { RSC } from "./resource";

/**
 * 질의 분해 노드: 모델이 뽑은 핵심 컨텍스트 후보(이름 · 설명), 그 후보를 정리한 결과(중복 제거 방법 · 만든 / 올린 / 버린 아이템),
 * 사용한 프롬프트와 모델 응답 원문. 단계 기록이 없는 옛 실행은 후보 대신 안내만 보인다.
 */
export function AnalyzeBody({ run, doc, t }: KindProps) {
  const steps = run.plan?.steps;
  const analyze = steps?.find((step): step is Extract<PlanStep, { kind: "analyze" }> => step.kind === "analyze");
  const seed = steps?.find((step): step is Extract<PlanStep, { kind: "seed" }> => step.kind === "seed" && step.round === 0);
  return (
    <>
      <Section title={t[RSC.RUNS_NODE_ANALYZE_RESULT_LABEL]} testId="run-node-analyze-result">
        {analyze ? <AnalyzeRow drafts={analyze.drafts} error={analyze.error} t={t} /> : <p className="text-muted">{t[RSC.RUNS_NODE_ANALYZE_STEPS_NONE_MESSAGE]}</p>}
      </Section>
      <Section title={t[RSC.RUNS_NODE_ANALYZE_SEED_LABEL]} testId="run-node-analyze-seed">
        {seed ? <SeedRow step={seed} items={run.plan?.items ?? []} t={t} /> : <p className="text-muted">{t[RSC.RUNS_NODE_ANALYZE_STEPS_NONE_MESSAGE]}</p>}
      </Section>
      <CallList calls={doc.doc?.calls ?? []} testId="run-node-analyze-calls" t={t} />
      <DedupeCalls run={run} round={0} title={t[RSC.RUNS_NODE_ANALYZE_DEDUPE_LABEL]} t={t} />
    </>
  );
}
