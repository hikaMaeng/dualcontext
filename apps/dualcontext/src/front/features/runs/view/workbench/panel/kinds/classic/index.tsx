import { RSC as CONTEXT } from "../../parts/context/resource";
import { AugmentDetail } from "../../parts/augment-detail";
import { CallList } from "../../parts/calls";
import { ContextBox } from "../../parts/context";
import { Section } from "../../parts/section";
import type { KindProps } from "../../types";

/** classic 증강 노드: 한 번의 증강(조사원 라우팅 → 수집 → 프로시저 → 라이터)의 라우팅 · 조사원 쌍과 자료 · 사용된 프롬프트 · 만들어진 컨텍스트. 앞의 둘과 뒤의 하나는 실행 행에 있다. */
export function ClassicBody({ run, doc, t }: KindProps) {
  return (
    <>
      <AugmentDetail run={run} routing={run.routing} pairs={run.pairs} researcherRouting={run.researcherRouting} testId="run-node-classic" t={t} />
      <CallList calls={doc.doc?.calls ?? []} testId="run-node-classic-calls" t={t} />
      <Section title={t[CONTEXT.RUNS_CONTEXT_LABEL]} testId="run-node-classic-context">
        <ContextBox text={run.context} t={t} />
      </Section>
    </>
  );
}
