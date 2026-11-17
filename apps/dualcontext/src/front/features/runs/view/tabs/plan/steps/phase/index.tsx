import type { PlanItem, PlanStep } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../i18n";
import { RSC as ROOT } from "../../../../../../../resource";
import { formatSeconds } from "../../../../../format";
import { phaseMs, phaseShare, type StepPhase } from "../model";
import { AnalyzeRow } from "../rows/analyze";
import { AnswerRow } from "../rows/answer";
import { AssembleRow } from "../rows/assemble";
import { BuildRow } from "../rows/build";
import { DedupeRow } from "../rows/dedupe";
import { EvaluateRow } from "../rows/evaluate";
import { PrerequisitesRow } from "../rows/prerequisites";
import { SeedRow } from "../rows/seed";
import { RSC } from "./resource";

type Props = { phase: StepPhase; items: PlanItem[]; totalMs: number; live: boolean; t: Texts };

function title(phase: StepPhase, t: Texts): string {
  switch (phase.kind) {
    case "analyze": return t[RSC.RUNS_PLAN_STEPS_PHASE_ANALYZE_TITLE];
    case "seed": return t[RSC.RUNS_PLAN_STEPS_PHASE_SEED_TITLE];
    case "dependencies": return `${t[RSC.RUNS_PLAN_STEPS_PHASE_DEPENDENCIES_TITLE]} · ${t[RSC.RUNS_PLAN_STEPS_PHASE_LEVEL_TEXT]} ${phase.level}`;
    case "build": return `${t[RSC.RUNS_PLAN_STEPS_PHASE_BUILD_TITLE]} · ${t[RSC.RUNS_PLAN_STEPS_PHASE_WAVE_TEXT]} ${phase.wave}`;
    case "assemble": return t[RSC.RUNS_PLAN_STEPS_PHASE_ASSEMBLE_TITLE];
    case "answer": return t[RSC.RUNS_PLAN_STEPS_PHASE_ANSWER_TITLE];
    default: return t[RSC.RUNS_PLAN_STEPS_PHASE_EVALUATE_TITLE];
  }
}

function Row({ step, items, t }: { step: PlanStep; items: PlanItem[]; t: Texts }) {
  switch (step.kind) {
    case "analyze": return <AnalyzeRow drafts={step.drafts} error={step.error} t={t} />;
    case "seed": return <SeedRow step={step} items={items} t={t} />;
    case "prerequisites": return <PrerequisitesRow step={step} items={items} t={t} />;
    case "dedupe": return <DedupeRow step={step} items={items} t={t} />;
    case "build": return <BuildRow step={step} items={items} t={t} />;
    case "assemble": return <AssembleRow step={step} items={items} t={t} />;
    case "answer": return <AnswerRow step={step} t={t} />;
    default: return <EvaluateRow step={step} t={t} />;
  }
}

/**
 * 진행 기록의 묶음 하나: 제목 · 건수 · 걸린 시간(병렬은 시작~끝) · 전체 대비 막대. 펼치면 기록 한 줄씩.
 * 진행 중인 묶음(live)은 처음부터 펼쳐 보이고 「진행 중」 표시와 aria-current 를 단다. 오류가 있는 기록이 있으면 data-failed 로 알린다.
 */
export function PhaseBlock({ phase, items, totalMs, live, t }: Props) {
  const failed = phase.steps.some((step) => "error" in step && step.error !== undefined);
  const share = phaseShare(phase, totalMs);
  return (
    <li
      data-testid="plan-phase"
      data-kind={phase.kind}
      data-round={phase.round}
      data-level={phase.level}
      data-wave={phase.wave}
      data-failed={failed ? "true" : undefined}
      aria-current={live ? "step" : undefined}
      className="rounded-md border border-line text-sm"
    >
      <details open={live || undefined}>
        <summary className="grid cursor-pointer gap-1 p-2">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <strong className={failed ? "text-danger" : "text-fg"}>{title(phase, t)}</strong>
            <span className="text-xs text-muted">{t[RSC.RUNS_PLAN_STEPS_PHASE_COUNT_TEXT]} {phase.steps.length}</span>
            <span className="text-xs text-muted" data-testid="plan-phase-ms">{formatSeconds(phaseMs(phase))}{t[ROOT.COMMON_SECONDS_TEXT]}</span>
            {live && <span data-testid="plan-phase-live" className="rounded border border-accent px-1.5 text-xs text-accent">{t[RSC.RUNS_PLAN_STEPS_PHASE_LIVE_STATUS]}</span>}
          </span>
          <span aria-hidden="true" className="block h-1 w-full rounded bg-line"><span className="block h-1 rounded bg-accent" style={{ width: `${Math.max(share * 100, 1)}%` }} /></span>
        </summary>
        <ul className="grid gap-2 border-t border-line p-2">
          {phase.steps.map((step) => (
            <li key={step.seq} data-testid="plan-step" data-kind={step.kind} data-seq={step.seq}><Row step={step} items={items} t={t} /></li>
          ))}
        </ul>
      </details>
    </li>
  );
}
