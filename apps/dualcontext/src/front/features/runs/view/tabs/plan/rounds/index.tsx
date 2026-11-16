import type { PlanItem, PlanRound } from "dualcontext_domain/common";
import { MarkdownText } from "../../../../../../components/markdown";
import type { Texts } from "../../../../../../i18n";
import { cn } from "../../../../../../lib/utils";
import { RSC as ROOT } from "../../../../../../resource";
import { formatSeconds } from "../../../../format";
import { itemName } from "../model";
import { RSC } from "./resource";

type Props = { rounds: PlanRound[]; items: PlanItem[]; t: Texts };

/**
 * 재평가 라운드 목록(reevaluate 모드). 라운드 0 은 처음 컨텍스트로 만든 답변이다. 라운드마다 점수 · 통과 여부 · 평가 한 줄,
 * 부족하다고 본 컨텍스트와 이유, 그래서 추가된 아이템, 답변 길이(문자)와 소요, 답변 본문(펼치기)을 보인다.
 */
export function PlanRounds({ rounds, items, t }: Props) {
  return (
    <section aria-labelledby="plan-rounds-heading" className="grid gap-2">
      <h3 id="plan-rounds-heading" className="text-sm font-semibold text-muted">{t[RSC.RUNS_PLAN_ROUNDS_HEADING_TEXT]}</h3>
      {rounds.length === 0 ? (
        <p data-testid="plan-rounds-empty" className="text-sm text-muted">{t[RSC.RUNS_PLAN_ROUNDS_EMPTY_MESSAGE]}</p>
      ) : (
        <ol data-testid="plan-rounds" aria-labelledby="plan-rounds-heading" className="grid gap-2">
          {rounds.map((round) => <RoundRow key={round.round} round={round} items={items} t={t} />)}
        </ol>
      )}
    </section>
  );
}

function RoundRow({ round, items, t }: { round: PlanRound; items: PlanItem[]; t: Texts }) {
  const evaluation = round.evaluation;
  const answerChars = round.answer.text?.length ?? 0;
  return (
    <li data-testid="plan-round" data-round={round.round} data-pass={evaluation ? String(evaluation.pass) : undefined} className="grid gap-2 rounded-md border border-line p-3 text-sm">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <strong>{round.round === 0 ? t[RSC.RUNS_PLAN_ROUNDS_FIRST_TEXT] : `${t[RSC.RUNS_PLAN_ROUNDS_ROUND_TEXT]} ${round.round}`}</strong>
        {evaluation && (
          <>
            <span><span className="text-muted">{t[RSC.RUNS_PLAN_ROUNDS_SCORE_LABEL]}: </span><span data-testid="plan-round-score">{evaluation.score}</span></span>
            <span data-testid="plan-round-pass" className={cn("rounded border px-1.5 text-xs", evaluation.pass ? "border-accent text-accent" : "border-danger text-danger")}>
              {evaluation.pass ? t[RSC.RUNS_PLAN_ROUNDS_PASS_TEXT] : t[RSC.RUNS_PLAN_ROUNDS_FAIL_TEXT]}
            </span>
          </>
        )}
        <span><span className="text-muted">{t[RSC.RUNS_PLAN_ROUNDS_CONTEXT_LABEL]}: </span>{round.contextChars}</span>
        <span>
          <span className="text-muted">{t[RSC.RUNS_PLAN_ROUNDS_ANSWER_LABEL]}: </span>
          <span data-testid="plan-round-answer-chars">{answerChars}</span> · {formatSeconds(round.answer.ms)}{t[ROOT.COMMON_SECONDS_TEXT]}
        </span>
      </p>
      {round.answer.error && <p role="alert" className="text-danger">{t[RSC.RUNS_PLAN_ROUNDS_ANSWER_ERROR_LABEL]}: {round.answer.error}</p>}
      {round.evaluationError && <p role="alert" data-testid="plan-round-evaluation-error" className="text-danger">{t[RSC.RUNS_PLAN_ROUNDS_EVALUATION_ERROR_LABEL]}: {round.evaluationError}</p>}
      {evaluation?.reason && <p data-testid="plan-round-reason"><span className="text-muted">{t[RSC.RUNS_PLAN_ROUNDS_REASON_LABEL]}: </span>{evaluation.reason}</p>}
      {evaluation && evaluation.missing.length > 0 && (
        <div className="grid gap-1">
          <h4 className="text-xs font-semibold text-muted">{t[RSC.RUNS_PLAN_ROUNDS_MISSING_LABEL]}</h4>
          <ul data-testid="plan-round-missing" className="grid gap-1">
            {evaluation.missing.map((missing, index) => (
              <li key={index}>
                <strong className="text-fg">{missing.name}</strong>
                {missing.description && <span className="text-muted"> · {missing.description}</span>}
                {missing.reason && <span className="block text-xs text-muted">{t[RSC.RUNS_PLAN_ROUNDS_MISSING_REASON_LABEL]}: {missing.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {round.addedItemIds.length > 0 && (
        <p data-testid="plan-round-added"><span className="text-muted">{t[RSC.RUNS_PLAN_ROUNDS_ADDED_LABEL]}: </span>{round.addedItemIds.map((id) => itemName(items, id)).join(", ")}</p>
      )}
      {round.answer.text && (
        <details>
          <summary className="cursor-pointer text-muted">{t[RSC.RUNS_PLAN_ROUNDS_ANSWER_SHOW_BUTTON]}</summary>
          <div data-testid="plan-round-answer" className="mt-2 max-h-96 overflow-auto break-words rounded-md border border-line bg-sidebar p-3 leading-6">
            <MarkdownText text={round.answer.text} />
          </div>
        </details>
      )}
    </li>
  );
}
