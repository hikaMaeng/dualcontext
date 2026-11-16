import { Tabs } from "../../../../components/tabs";
import { AnswerPanel } from "./answer";
import { ContextPanel } from "./context";
import { ResearchersPanel } from "./researchers";
import { RoutingPanel } from "./routing";
import { RSC } from "./resource";
import type { PanelProps } from "./types";

export type TabId = "answer" | "routing" | "researchers" | "context";

type Props = PanelProps & { tab: TabId; onTab: (tab: TabId) => void };

/** 뷰의 서브탭: 답변 | 라우팅 | 조사원 | 컨텍스트. 선택은 부모가 들고 있어 실행이 SSE 로 갱신돼도 유지된다. */
export function RunTabs({ tab, onTab, ...panel }: Props) {
  const { t } = panel;
  const tabs = [
    { id: "answer", label: t[RSC.RUNS_TABS_ANSWER_BUTTON] },
    { id: "routing", label: t[RSC.RUNS_TABS_ROUTING_BUTTON] },
    { id: "researchers", label: t[RSC.RUNS_TABS_RESEARCHERS_BUTTON] },
    { id: "context", label: t[RSC.RUNS_TABS_CONTEXT_BUTTON] }
  ];
  return (
    <Tabs label={t[RSC.RUNS_TABS_LABEL]} tabs={tabs} active={tab} onChange={(id) => onTab(id as TabId)} prefix="run">
      {tab === "answer" && <AnswerPanel {...panel} />}
      {tab === "routing" && <RoutingPanel {...panel} />}
      {tab === "researchers" && <ResearchersPanel {...panel} />}
      {tab === "context" && <ContextPanel {...panel} />}
    </Tabs>
  );
}
