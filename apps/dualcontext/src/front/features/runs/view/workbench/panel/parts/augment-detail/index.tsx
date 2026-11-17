import type { AugmentPair, RoutingTrace } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../i18n";
import type { RunDetail } from "../../../../../../../lib/run";
import { Section } from "../section";
import { ResearchersPanel } from "../researchers";
import { RoutingPanel } from "../routing";
import { RSC } from "./resource";

type Props = {
  run: RunDetail;
  /** 이 노드의 증강 결과. routing 이 null 이면 라우팅 기록이 없는 것(옛 실행 · 상세 문서 없음). */
  routing: RoutingTrace | null;
  pairs: AugmentPair[];
  researcherRouting: string | null;
  testId: string;
  t: Texts;
};

/**
 * 라우팅(조사원 라우팅 단계 · 점수 · 프로시저 라우팅)과 선택된 조사원 · 프로시저 쌍과 수집 자료. 기존 라우팅 · 조사원 패널을 그대로 쓰되
 * 이 노드의 값으로 만든 실행 상세를 넘긴다. 라우팅 기록이 없으면 그 구역은 안내만 보인다(쌍은 실행 행에서 온 것이라도 보인다).
 */
export function AugmentDetail({ run, routing, pairs, researcherRouting, testId, t }: Props) {
  const detail = { ...run, routing, pairs, researcherRouting };
  const phase = { running: false, augmentDone: true };
  return (
    <>
      <Section title={t[RSC.RUNS_AUGMENT_ROUTING_LABEL]} testId={`${testId}-routing`}>
        {routing ? <RoutingPanel detail={detail} phase={phase} t={t} /> : <p className="text-muted">{t[RSC.RUNS_AUGMENT_NONE_MESSAGE]}</p>}
      </Section>
      <Section title={`${t[RSC.RUNS_AUGMENT_PAIRS_LABEL]} (${pairs.length})`} testId={`${testId}-pairs`}>
        <ResearchersPanel detail={detail} phase={phase} t={t} />
      </Section>
    </>
  );
}
