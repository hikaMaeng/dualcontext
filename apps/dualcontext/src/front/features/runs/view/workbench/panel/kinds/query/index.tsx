import { planModeMessage, planModeText } from "../../../../../../../components/plan-labels";
import { readExecutionPlan } from "../../../../summary/execution/model";
import { Section } from "../../parts/section";
import { RSC as CONTEXT } from "../../parts/context/resource";
import { PlanSummary } from "../../parts/plan-summary";
import { TextBox } from "../../parts/text-box";
import type { KindProps } from "../../types";
import { RSC } from "./resource";

/** 질의 노드: 질의 전문, 이 실행이 쓴 계획(모드 · 아이템 수 · 정지 사유 · 소요), 실행 당시 설정 스냅샷(라우터 · 라이터 · 모델 · 프롬프트). */
export function QueryBody({ run, running, t }: KindProps) {
  const mode = readExecutionPlan(run.settings, run.plan?.mode).mode;
  return (
    <>
      <Section title={t[RSC.RUNS_NODE_QUERY_TEXT_LABEL]} testId="run-node-query-text">
        <p data-testid="run-query-full" className="whitespace-pre-wrap break-words text-base leading-7">{run.query}</p>
      </Section>
      <Section title={t[RSC.RUNS_NODE_QUERY_PLAN_LABEL]} testId="run-node-query-plan">
        {run.plan ? (
          <PlanSummary plan={run.plan} running={running} t={t} />
        ) : (
          <p className="text-muted">{planModeText(mode, t)}: {planModeMessage(mode, t) || t[RSC.RUNS_NODE_QUERY_PLAN_NONE_MESSAGE]}</p>
        )}
      </Section>
      <Section title={t[CONTEXT.RUNS_SETTINGS_LABEL]} testId="run-node-query-settings" defaultOpen={false}>
        <TextBox text={JSON.stringify(run.settings, null, 2)} testId="run-settings" />
      </Section>
    </>
  );
}
