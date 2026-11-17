import type { LlmCall } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../i18n";
import { RSC as ROOT } from "../../../../../../../resource";
import { formatSeconds } from "../../../../../format";
import { Section } from "../section";
import { TextBox } from "../text-box";
import { RSC } from "./resource";

const purposeText: Record<NonNullable<LlmCall["purpose"]>, RSC> = {
  analyze: RSC.RUNS_CALLS_ANALYZE_TEXT,
  prerequisites: RSC.RUNS_CALLS_PREREQUISITES_TEXT,
  dedupe: RSC.RUNS_CALLS_DEDUPE_TEXT,
  answer: RSC.RUNS_CALLS_ANSWER_TEXT,
  evaluate: RSC.RUNS_CALLS_EVALUATE_TEXT
};

type Props = { calls: LlmCall[]; testId: string; title?: string; t: Texts };

/**
 * 사용된 프롬프트: 이 노드가 부른 모델 호출을 순서대로. 호출마다 실제로 보낸 프롬프트(값이 채워진 글)와 응답 원문, 소요가 있다.
 * 목적을 아는 호출(질의 분석 · 사전 요구 · 중복 정리 · 답변 · 평가)은 이름이 붙고 나머지(라우팅 · 프로시저 · 라이터 …)는 「라우팅 · 프로시저 · 라이터 호출」이다.
 */
export function CallList({ calls, testId, title, t }: Props) {
  return (
    <Section title={`${title ?? t[RSC.RUNS_CALLS_HEADING]} (${calls.length})`} testId={testId} defaultOpen={false}>
      {calls.length === 0 ? (
        <p className="text-muted">{t[RSC.RUNS_CALLS_EMPTY_MESSAGE]}</p>
      ) : (
        <ol className="grid gap-2">
          {calls.map((call) => (
            <li key={call.seq} data-testid="run-call" data-seq={call.seq} data-purpose={call.purpose} className="rounded-md border border-line">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <strong className={call.error ? "text-danger" : "text-fg"}>{t[RSC.RUNS_CALLS_CALL_TEXT]} {call.seq}</strong>
                  <span className="text-xs text-muted">{call.purpose ? t[purposeText[call.purpose]] : t[RSC.RUNS_CALLS_OTHER_TEXT]}</span>
                  <span className="text-xs text-muted">{formatSeconds(call.ms)}{t[ROOT.COMMON_SECONDS_TEXT]}</span>
                  {call.truncated && <span className="rounded border border-line px-1.5 text-xs text-muted">{t[RSC.RUNS_CALLS_TRUNCATED_TEXT]}</span>}
                </summary>
                <div className="grid gap-2 border-t border-line p-3">
                  <h5 className="text-xs font-semibold text-muted">{t[RSC.RUNS_CALLS_PROMPT_LABEL]}</h5>
                  <TextBox text={call.prompt} testId="run-call-prompt" />
                  <h5 className="text-xs font-semibold text-muted">{t[RSC.RUNS_CALLS_RESPONSE_LABEL]}</h5>
                  {call.error && <p role="alert" className="text-danger">{t[RSC.RUNS_CALLS_ERROR_LABEL]}: {call.error}</p>}
                  {call.response !== null && <TextBox text={call.response} testId="run-call-response" />}
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
