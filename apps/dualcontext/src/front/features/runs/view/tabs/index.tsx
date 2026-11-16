import { Tabs } from "../../../../components/tabs";
import { AnswerPanel } from "./answer";
import { ContextPanel } from "./context";
import { PlanPanel } from "./plan";
import { ResearchersPanel } from "./researchers";
import { RoutingPanel } from "./routing";
import { RSC } from "./resource";
import type { PanelProps } from "./types";

export type TabId = "answer" | "plan" | "routing" | "researchers" | "context";

type Props = PanelProps & { tab: TabId; onTab: (tab: TabId) => void };

/**
 * 뷰의 서브탭: 답변 | 계획 | 라우팅 | 조사원 | 컨텍스트. 선택은 부모가 들고 있어 실행이 SSE 로 갱신돼도 유지된다.
 * 「계획」은 실행에 계획 기록(plan)이 있을 때만 나온다(classic 과 옛 실행은 없다). 서버는 계획이 끝나야 plan 을 채우므로
 * 진행 중에는 탭 대신 요약 아래의 진행 줄(components/plan-progress)이 단계를 보인다.
 */
export function RunTabs({ tab, onTab, ...panel }: Props) {
  const { t } = panel;
  const hasPlan = Boolean(panel.detail.plan);
  const tabs = [
    { id: "answer", label: t[RSC.RUNS_TABS_ANSWER_BUTTON] },
    ...(hasPlan ? [{ id: "plan", label: t[RSC.RUNS_TABS_PLAN_BUTTON] }] : []),
    { id: "routing", label: t[RSC.RUNS_TABS_ROUTING_BUTTON] },
    { id: "researchers", label: t[RSC.RUNS_TABS_RESEARCHERS_BUTTON] },
    { id: "context", label: t[RSC.RUNS_TABS_CONTEXT_BUTTON] }
  ];
  // 계획 기록이 없는데 계획 탭이 골라져 있으면(다른 실행으로 옮겨 온 경우 등) 답변 탭을 보인다.
  const active: TabId = tab === "plan" && !hasPlan ? "answer" : tab;
  return (
    <Tabs label={t[RSC.RUNS_TABS_LABEL]} tabs={tabs} active={active} onChange={(id) => onTab(id as TabId)} prefix="run">
      {active === "answer" && <AnswerPanel {...panel} />}
      {active === "plan" && <PlanPanel {...panel} />}
      {active === "routing" && <RoutingPanel {...panel} />}
      {active === "researchers" && <ResearchersPanel {...panel} />}
      {active === "context" && <ContextPanel {...panel} />}
    </Tabs>
  );
}
