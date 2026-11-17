import { RoutingScores } from "../../../../../../../components/routing-scores";
import { RoutingSteps } from "../../../../../../../components/routing-steps";
import { RSC as ROOT } from "../../../../../../../resource";
import type { PanelProps } from "../../../types";
import { RSC } from "./resource";

/**
 * 라우팅 탭: 조사원 라우팅이 쓴 방법, 단계별 기록(RoutingSteps), 후보 점수표(RoutingScores),
 * 쌍마다의 프로시저 라우팅 기록. 시험 실행 화면이 쓰는 컴포넌트를 그대로 쓴다.
 */
export function RoutingPanel({ detail, phase, t }: PanelProps) {
  const none = phase.augmentDone && detail.pairs.length === 0;
  return (
    <>
      <p className="text-sm">
        <span className="text-muted">{t[RSC.RUNS_ROUTING_LABEL]}: </span>
        <span data-testid="run-routing">{detail.researcherRouting ?? "-"}</span>
      </p>
      {none && <p role="status" data-testid="run-routing-none" className="text-sm">{t[ROOT.COMMON_ROUTING_NONE_MESSAGE]}</p>}
      {!phase.augmentDone && !detail.routing && <p role="status" data-testid="run-routing-empty" className="text-sm text-muted">{t[RSC.RUNS_ROUTING_EMPTY_MESSAGE]}</p>}
      <RoutingSteps routing={detail.routing} t={t} />
      <RoutingScores routing={detail.routing} t={t} />
      {detail.pairs.length > 0 && (
        <section aria-label={t[RSC.RUNS_ROUTING_PROCEDURE_LABEL]} className="grid gap-1">
          <h3 className="text-sm font-semibold text-muted">{t[RSC.RUNS_ROUTING_PROCEDURE_LABEL]}</h3>
          <ul data-testid="run-procedure-routing" className="grid gap-0.5 text-sm text-muted">
            {detail.pairs.map((pair, index) => (
              <li key={index}>{pair.researcher} / {pair.procedure ?? "-"}: {pair.procedureRouting}</li>
            ))}
          </ul>
          {detail.routing?.procedures.some((entry) => entry.fallback) && (
            <ul data-testid="run-procedure-fallback" className="grid gap-0.5 text-sm text-muted">
              {detail.routing.procedures.filter((entry) => entry.fallback).map((entry) => (
                <li key={entry.researcher} data-researcher={entry.researcher}>{entry.researcher}: {t[RSC.RUNS_ROUTING_FALLBACK_MESSAGE]}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
