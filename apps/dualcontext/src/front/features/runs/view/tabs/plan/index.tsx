import type { PanelProps } from "../types";
import { PlanLevels } from "./levels";
import { PlanRounds } from "./rounds";
import { PlanSummary } from "./summary";
import { PlanTree } from "./tree";
import { PlanWaves } from "./waves";

/**
 * 계획 탭: ① 요약 한 줄 ② 의존성 트리 ③ 단계별 분석 로그 ④ 생성 웨이브 ⑤ 재평가 라운드(reevaluate 모드).
 * 서버는 계획이 끝난 뒤에만 plan 을 채운다(진행 중에는 planProgress 만). 그래도 빠진 배열은 빈 것으로 보고 그린다.
 */
export function PlanPanel({ detail, phase, t }: PanelProps) {
  const plan = detail.plan;
  if (!plan) return null;
  const items = plan.items ?? [];
  const rounds = plan.rounds ?? [];
  return (
    <div data-testid="run-plan" data-mode={plan.mode} className="grid gap-4">
      <PlanSummary plan={plan} running={phase.running} t={t} />
      <PlanTree items={items} t={t} />
      <PlanLevels levels={plan.levels ?? []} items={items} t={t} />
      <PlanWaves plan={{ items, waves: plan.waves ?? [] }} t={t} />
      {(plan.mode === "reevaluate" || rounds.length > 0) && <PlanRounds rounds={rounds} items={items} t={t} />}
    </div>
  );
}
