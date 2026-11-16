import type { Answer, Answers } from "dualcontext_domain/common";
import type { Texts } from "../i18n";
import { RSC } from "../resource";
import { MarkdownText } from "./markdown";

function AnswerBox({ label, answer, pending, testId, t }: { label: string; answer: Answer | undefined; pending: boolean; testId: string; t: Texts }) {
  return (
    <section aria-label={label} className="grid min-w-0 content-start gap-1">
      <h3 className="text-sm font-semibold text-muted">
        {label}
        {answer && !answer.skipped ? ` · ${(answer.ms / 1000).toFixed(1)}${t[RSC.COMMON_SECONDS_TEXT]}` : ""}
      </h3>
      {answer && answer.text !== null && (
        <div data-testid={testId} className="max-h-[32rem] overflow-auto break-words rounded-md border border-line bg-sidebar p-3 text-sm leading-6"><MarkdownText text={answer.text} /></div>
      )}
      {answer?.skipped && (
        <p role="status" data-testid={`${testId}-skipped`} className="rounded-md border border-dashed border-line p-3 text-sm text-muted">
          {t[RSC.COMMON_ANSWER_SKIPPED_STATUS]}
        </p>
      )}
      {answer && !answer.skipped && answer.text === null && (
        <p role="alert" data-testid={testId} className="rounded-md border border-line p-3 text-sm text-danger">
          {t[RSC.COMMON_ANSWER_FAILED_ALERT]}: {answer.error}
        </p>
      )}
      {!answer && pending && (
        <p role="status" data-testid={`${testId}-pending`} className="rounded-md border border-dashed border-line p-3 text-sm text-muted">
          {t[RSC.COMMON_ANSWER_PENDING_STATUS]}
        </p>
      )}
    </section>
  );
}

/**
 * 컨텐츠 증강 전(질의만)과 후(질의 + 컨텍스트)의 최종 답변을 나란히 보여 준다.
 * 실행이 진행 중이면(pending) 아직 없는 답변 자리에 「만드는 중」을 보이고, 끝나는 대로 채워진다.
 */
export function AnswerCompare({ answers, pending, t }: { answers: Partial<Answers> | null; pending: boolean; t: Texts }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <AnswerBox label={t[RSC.COMMON_ANSWER_BEFORE_LABEL]} answer={answers?.before} pending={pending} testId="answer-before" t={t} />
      <AnswerBox label={t[RSC.COMMON_ANSWER_AFTER_LABEL]} answer={answers?.after} pending={pending} testId="answer-after" t={t} />
    </div>
  );
}
