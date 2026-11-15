import type { IndividualTrace, RoutingTrace, StepTrace } from "dualcontext_domain/common";
import type { Texts } from "../i18n";
import { RSC } from "../resource";

function StepList({ steps, t }: { steps: StepTrace[]; t: Texts }) {
  return (
    <ol className="grid gap-0.5 text-sm text-muted">
      {steps.map((step, index) => (
        <li key={index} data-testid="routing-step" className="font-mono">
          {step.type} {step.input}→{step.output} · {(step.ms / 1000).toFixed(1)}{t[RSC.COMMON_SECONDS_TEXT]}{step.note ? ` · ${step.note}` : ""}
        </li>
      ))}
    </ol>
  );
}

function Verdict({ verdict, t }: { verdict: IndividualTrace; t: Texts }) {
  return (
    <li data-testid="routing-individual" data-selected={verdict.selected} className={verdict.selected ? "grid gap-0.5 text-fg" : "grid gap-0.5 text-muted"}>
      <span>{verdict.researcher} · {verdict.selected ? t[RSC.COMMON_ROUTING_SELECTED_STATUS] : t[RSC.COMMON_ROUTING_EXCLUDED_STATUS]} · {verdict.mode}</span>
      <StepList steps={verdict.steps} t={t} />
    </li>
  );
}

/**
 * 조사원 라우팅이 실제로 한 일: 하위 질문, 질의(통째 · 하위 질문)별 단계 기록(몇 개에서 몇 개로, 걸린 시간, 건너뜀 · 실패 사유),
 * 개별 라우터를 가진 조사원마다의 판정. 점수표(RoutingScores)는 임베딩 점수가 있을 때만 나오므로, LLM 단계만 거치는
 * 개별 라우터의 판정은 여기서만 보인다. 옛 실행 기록에는 이 정보가 없어 아무것도 그리지 않는다.
 */
export function RoutingSteps({ routing, t }: { routing: RoutingTrace | null | undefined; t: Texts }) {
  const asked = routing?.researcherSteps ?? [];
  const individual = routing?.individual ?? [];
  // 하위 질문의 개별 판정은 그 질문에서 단계가 실제로 돈 경우만 보인다(parts 를 끈 단계는 하위 질문에서 돌지 않는다).
  const verdicts = individual.map((entry, index) => ({ asked: entry.asked, results: index === 0 ? entry.results : entry.results.filter((result) => result.steps.length > 0) })).filter((entry) => entry.results.length > 0);
  const stepped = asked.filter((entry) => entry.steps.length > 0);
  if (!routing || (stepped.length === 0 && verdicts.length === 0 && !(routing.parts && routing.parts.length > 0))) return null;
  return (
    <section aria-label={t[RSC.COMMON_ROUTING_STEPS_LABEL]} className="grid gap-2" data-testid="routing-steps">
      <h3 className="text-sm font-semibold text-muted">{t[RSC.COMMON_ROUTING_STEPS_LABEL]}</h3>
      {routing.parts && routing.parts.length > 0 && (
        <ul aria-label={t[RSC.COMMON_ROUTING_PARTS_LABEL]} className="grid gap-0.5 text-sm text-muted">
          {routing.parts.map((part) => <li key={part}>{part}</li>)}
        </ul>
      )}
      {stepped.map((entry) => (
        <div key={entry.asked} className="grid gap-0.5 text-sm">
          <span className="truncate">{entry.asked}</span>
          <StepList steps={entry.steps} t={t} />
        </div>
      ))}
      {verdicts.length > 0 && (
        <div className="grid gap-1 text-sm">
          <h4 className="font-semibold text-muted">{t[RSC.COMMON_ROUTING_INDIVIDUAL_LABEL]}</h4>
          {verdicts.map((entry) => (
            <div key={entry.asked} className="grid gap-0.5">
              <span className="truncate text-muted">{entry.asked}</span>
              <ul className="grid gap-1">{entry.results.map((verdict) => <Verdict key={verdict.researcher} verdict={verdict} t={t} />)}</ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
