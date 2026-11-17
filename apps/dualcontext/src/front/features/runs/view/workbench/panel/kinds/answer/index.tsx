import type { PlanStep } from "dualcontext_domain/common";
import { AnswerCompare } from "../../../../../../../components/answers";
import { MarkdownText } from "../../../../../../../components/markdown";
import { RSC as COMMON } from "../../../../../../../resource";
import { AssembleRow } from "../../rows/assemble";
import { CallList } from "../../parts/calls";
import { ContextBox } from "../../parts/context";
import { Section } from "../../parts/section";
import type { KindProps } from "../../types";
import { RSC } from "./resource";

/**
 * 답변 노드. answer:<r> 은 재평가 라운드 r 의 답변(사용한 컨텍스트 · 조립한 아이템 · 답변 본문), answer:before 는 컨텍스트 없이 질의만으로 만든 답변,
 * answer:after(와 최종으로 쓰인 라운드 답변)는 증강된 컨텍스트로 만든 최종 답변이다. 최종 답변 노드에는 증강 전 · 후 비교도 있다.
 * 사용한 프롬프트 · 응답은 서버 상세 문서(calls)에서 온다.
 */
export function AnswerBody({ run, node, doc, running, t }: KindProps) {
  const round = node.kind === "answer" && node.round !== undefined ? run.plan?.rounds[node.round] : undefined;
  const answer = node.kind === "final-before" ? run.answers?.before : node.kind === "final-after" ? run.answers?.after : round?.answer;
  const text = answer && "text" in answer ? answer.text : null;
  const error = answer?.error ?? null;
  const steps = run.plan?.steps ?? [];
  const assemble = node.kind === "answer"
    ? steps.find((step): step is Extract<PlanStep, { kind: "assemble" }> => step.kind === "assemble" && step.round === node.round)
    : node.kind === "final-after" ? [...steps].reverse().find((step): step is Extract<PlanStep, { kind: "assemble" }> => step.kind === "assemble") : undefined;
  const context = node.kind === "answer" ? undefined : node.kind === "final-after" ? run.context : undefined;
  const showCompare = node.final === true;
  // 라운드 답변이 실패하면 재사용할 수 없어 최종 답변을 따로 다시 만든다. 그 최종 답변이 성공했으면 실패 표시가 혼란스럽지 않게 안내한다.
  const after = run.answers?.after;
  const finalRegenerated = Boolean(after && "text" in after && after.text && !after.error && !("fromPlan" in after && after.fromPlan));
  return (
    <>
      {assemble && (
        <Section title={t[RSC.RUNS_NODE_ANSWER_ITEMS_LABEL]} testId="run-node-answer-assemble">
          <AssembleRow step={assemble} items={run.plan?.items ?? []} t={t} />
        </Section>
      )}
      {round && (
        <p data-testid="run-node-answer-context-chars" className="text-sm text-muted">{t[RSC.RUNS_NODE_ANSWER_CONTEXT_LABEL]}: {round.contextChars}</p>
      )}
      <Section title={t[RSC.RUNS_NODE_ANSWER_TEXT_LABEL]} testId="run-node-answer-text">
        {error && <p role="alert" className="text-danger">{t[COMMON.COMMON_ANSWER_FAILED_ALERT]}: {error}</p>}
        {error && node.kind === "answer" && finalRegenerated && (
          <p data-testid="run-node-answer-retried" role="status" className="text-sm text-muted">{t[RSC.RUNS_NODE_ANSWER_RETRIED_MESSAGE]}</p>
        )}
        {text !== null && text !== undefined && (
          <div data-testid="run-node-answer-body" className="max-h-96 overflow-auto break-words rounded-md border border-line bg-sidebar p-3 leading-6 group-data-[expanded=true]/panel:max-h-[75vh]"><MarkdownText text={text} /></div>
        )}
        {!error && (text === null || text === undefined) && (
          <p role="status" className="text-muted">{running ? t[COMMON.COMMON_ANSWER_PENDING_STATUS] : t[RSC.RUNS_NODE_ANSWER_NONE_MESSAGE]}</p>
        )}
        {Boolean(answer && "fromPlan" in answer && answer.fromPlan) && <p className="text-xs text-muted">{t[RSC.RUNS_NODE_ANSWER_FROMPLAN_MESSAGE]}</p>}
      </Section>
      {context && (
        <Section title={t[RSC.RUNS_NODE_ANSWER_CONTEXT_LABEL]} testId="run-node-answer-context" defaultOpen={false}>
          <ContextBox text={context} t={t} />
        </Section>
      )}
      <CallList calls={doc.doc?.calls ?? []} testId="run-node-answer-calls" t={t} />
      {showCompare && (
        <Section title={t[RSC.RUNS_NODE_ANSWER_COMPARE_LABEL]} testId="run-node-answer-compare" defaultOpen={false}>
          <AnswerCompare answers={run.answers} pending={running} t={t} />
        </Section>
      )}
    </>
  );
}
