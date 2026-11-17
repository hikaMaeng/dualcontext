import type { PanelProps } from "../types";
import { PlanGraph } from "./graph";
import { PlanLevels } from "./levels";
import { PlanRounds } from "./rounds";
import { PlanSteps } from "./steps";
import { PlanSummary } from "./summary";
import { PlanTree } from "./tree";
import { PlanWaves } from "./waves";

/**
 * 계획 탭: ① 요약 ② 의존성 그래프 ③ 진행 기록(단계별 타임라인) ④ 재평가 라운드(reevaluate 모드) ⑤ 의존성 트리(아이템 상세) ⑥ 단계 · 웨이브 표.
 * 서버는 계획이 진행되는 동안에도 부분 trace(stop=null)를 plan 에 저장하므로 실행 중에도 이 탭이 갱신된다.
 * 단계 기록(steps)이 없는 옛 실행과 빠진 배열은 빈 것으로 보고 그린다.
 */
export function PlanPanel({ detail, phase, t }: PanelProps) {
  const plan = detail.plan;
  if (!plan) return null;
  const items = plan.items ?? [];
  const rounds = plan.rounds ?? [];
  return (
    <div data-testid="run-plan" data-mode={plan.mode} className="grid gap-4">
      <PlanSummary plan={plan} running={phase.running} t={t} />
      <PlanGraph items={items} t={t} />
      <PlanSteps steps={plan.steps} items={items} running={phase.running} stopped={plan.stop !== null && plan.stop !== undefined} t={t} />
      {(plan.mode === "reevaluate" || rounds.length > 0) && <PlanRounds rounds={rounds} items={items} t={t} />}
      <PlanTree items={items} t={t} />
      <PlanLevels levels={plan.levels ?? []} items={items} t={t} />
      <PlanWaves plan={{ items, waves: plan.waves ?? [] }} t={t} />
    </div>
  );
}
