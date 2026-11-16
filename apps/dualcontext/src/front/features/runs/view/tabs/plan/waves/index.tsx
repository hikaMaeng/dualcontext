import type { PlanTrace } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../i18n";
import { waveNames } from "../model";
import { RSC } from "./resource";

/** 컨텍스트 생성 순서. 웨이브 하나가 병렬로 만든 아이템 묶음이고 위에서 아래 순서로 만들어졌다. */
export function PlanWaves({ plan, t }: { plan: Pick<PlanTrace, "items" | "waves">; t: Texts }) {
  const waves = waveNames(plan);
  return (
    <section aria-labelledby="plan-waves-heading" className="grid gap-1">
      <h3 id="plan-waves-heading" className="text-sm font-semibold text-muted">{t[RSC.RUNS_PLAN_WAVES_HEADING_TEXT]}</h3>
      {waves.length === 0 ? (
        <p data-testid="plan-waves-empty" className="text-sm text-muted">{t[RSC.RUNS_PLAN_WAVES_EMPTY_MESSAGE]}</p>
      ) : (
        <ol data-testid="plan-waves" aria-labelledby="plan-waves-heading" className="grid gap-0.5 text-sm">
          {waves.map((names, index) => (
            <li key={index} data-testid="plan-wave" data-wave={index + 1}>
              <span className="text-muted">{t[RSC.RUNS_PLAN_WAVES_WAVE_TEXT]} {index + 1}: </span>
              {names.join(", ")}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
