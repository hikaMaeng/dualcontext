import type { Answer, Answers } from "dualcontext_domain/common";
import type { Texts } from "../i18n";
import { RSC } from "../resource";

function AnswerBox({ label, answer, testId, t }: { label: string; answer: Answer; testId: string; t: Texts }) {
  return (
    <section aria-label={label} className="grid min-w-0 content-start gap-1">
      <h3 className="text-sm font-semibold text-muted">
        {label} · {(answer.ms / 1000).toFixed(1)}{t[RSC.COMMON_SECONDS_TEXT]}
      </h3>
      {answer.text !== null ? (
        <pre data-testid={testId} className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-sidebar p-3 font-sans text-sm leading-6">{answer.text}</pre>
      ) : (
        <p role="alert" data-testid={testId} className="rounded-md border border-line p-3 text-sm text-danger">
          {t[RSC.COMMON_ANSWER_FAILED_ALERT]}: {answer.error}
        </p>
      )}
    </section>
  );
}

/** 컨텐츠 증강 전(질의만)과 후(질의 + 컨텍스트)의 최종 답변을 나란히 보여 준다. */
export function AnswerCompare({ answers, t }: { answers: Answers; t: Texts }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <AnswerBox label={t[RSC.COMMON_ANSWER_BEFORE_LABEL]} answer={answers.before} testId="answer-before" t={t} />
      <AnswerBox label={t[RSC.COMMON_ANSWER_AFTER_LABEL]} answer={answers.after} testId="answer-after" t={t} />
    </div>
  );
}
