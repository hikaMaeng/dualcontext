import type { RoutingScore, RoutingTrace } from "dualcontext_domain/common";
import type { Texts } from "../i18n";
import { RSC } from "../resource";

function ScoreList({ scores, t, testId }: { scores: RoutingScore[]; t: Texts; testId: string }) {
  return (
    <ul data-testid={testId} className="grid gap-0.5 text-sm">
      {scores.map((entry) => (
        <li key={entry.name} data-selected={entry.selected} className={entry.selected ? "text-fg" : "text-muted"}>
          <span className="inline-block w-14 font-mono">{entry.score.toFixed(3)}</span>
          {entry.name} · {entry.selected ? t[RSC.COMMON_ROUTING_SELECTED_STATUS] : t[RSC.COMMON_ROUTING_EXCLUDED_STATUS]}
        </li>
      ))}
    </ul>
  );
}

/**
 * 임베딩 라우팅이 후보마다 매긴 유사도와 선택 여부. 왜 이 조사원이 골라졌는지(또는 왜 아무것도 고르지 않았는지)를
 * 최소 유사도 기준과 함께 읽을 수 있게 한다. 키워드 · LLM 방식은 점수가 없어 표가 비어 있다.
 */
export function RoutingScores({ routing, t }: { routing: RoutingTrace | null | undefined; t: Texts }) {
  if (!routing || routing.researchers.length === 0) return null;
  const selected = routing.researchers.filter((entry) => entry.selected);
  const excluded = routing.researchers.filter((entry) => !entry.selected);
  return (
    <section aria-label={t[RSC.COMMON_ROUTING_SCORES_LABEL]} className="grid gap-2" data-testid="routing-scores">
      <h3 className="text-sm font-semibold text-muted">{t[RSC.COMMON_ROUTING_SCORES_LABEL]}</h3>
      {selected.length > 0 ? <ScoreList scores={selected} t={t} testId="routing-scores-researchers" /> : null}
      {excluded.length > 0 ? (
        <details data-testid="routing-scores-excluded-group" className="text-sm">
          <summary className="cursor-pointer text-muted">
            {t[RSC.COMMON_ROUTING_EXCLUDED_TOGGLE]} ({excluded.length})
          </summary>
          <div className="mt-1">
            <ScoreList scores={excluded} t={t} testId="routing-scores-excluded" />
          </div>
        </details>
      ) : null}
    </section>
  );
}
