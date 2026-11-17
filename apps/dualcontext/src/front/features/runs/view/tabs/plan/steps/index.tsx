import type { PlanItem, PlanStep } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../i18n";
import { groupSteps, type StepPhase } from "./model";
import { PhaseBlock } from "./phase";
import { RSC } from "./resource";

type Props = { steps: PlanStep[] | undefined; items: PlanItem[]; running: boolean; stopped: boolean; t: Texts };

/**
 * 진행 기록: 계획이 밟은 단계를 시간 순서로 묶어 보인다. 라운드마다 머리를 달아(처음 계획 · 보강 라운드 n) 재평가 루프를 따라가게 한다.
 * 계획이 아직 멈추지 않았고(stopped=false) 실행이 진행 중이면 마지막 묶음이 「진행 중」이다.
 * steps 가 없는 실행(이 기록이 생기기 전)은 안내만 보이고 아래 표 · 트리가 대신한다.
 */
export function PlanSteps({ steps, items, running, stopped, t }: Props) {
  const phases = steps ? groupSteps(steps) : [];
  const totalMs = phases.reduce((max, phase) => Math.max(max, phase.endMs), 0);
  const liveKey = running && !stopped ? phases.at(-1)?.key : undefined;
  const rounds: { round: number; phases: StepPhase[] }[] = [];
  for (const phase of phases) {
    const last = rounds.at(-1);
    if (last && last.round === phase.round) last.phases.push(phase);
    else rounds.push({ round: phase.round, phases: [phase] });
  }
  return (
    <section aria-labelledby="plan-steps-heading" className="grid gap-2">
      <h3 id="plan-steps-heading" className="text-sm font-semibold text-muted">{t[RSC.RUNS_PLAN_STEPS_HEADING_TEXT]}</h3>
      {steps === undefined && <p role="status" data-testid="plan-steps-legacy" className="text-sm text-muted">{t[RSC.RUNS_PLAN_STEPS_LEGACY_MESSAGE]}</p>}
      {steps !== undefined && phases.length === 0 && <p role="status" data-testid="plan-steps-empty" className="text-sm text-muted">{t[RSC.RUNS_PLAN_STEPS_EMPTY_MESSAGE]}</p>}
      {rounds.map((group) => (
        <div key={group.round} data-testid="plan-steps-round" data-round={group.round} className="grid gap-2">
          <h4 className="text-xs font-semibold text-muted">{group.round === 0 ? t[RSC.RUNS_PLAN_STEPS_ROUND_FIRST_TEXT] : `${t[RSC.RUNS_PLAN_STEPS_ROUND_REINFORCE_TEXT]} ${group.round}`}</h4>
          <ol data-testid="plan-steps" className="grid gap-2">
            {group.phases.map((phase) => <PhaseBlock key={phase.key} phase={phase} items={items} totalMs={totalMs} live={phase.key === liveKey} t={t} />)}
          </ol>
        </div>
      ))}
    </section>
  );
}
