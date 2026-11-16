import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { nextTabId } from "./keys";

export type TabItem = { id: string; label: string };

type Props = {
  /** 탭 목록의 접근 가능한 이름. */
  label: string;
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** 탭 · 패널 id 와 `data-testid`(`<prefix>-tab-<id>`, `<prefix>-panel-<id>`)의 접두어. */
  prefix: string;
  /** 활성 탭의 내용. 비활성 패널은 그리지 않는다. */
  children: ReactNode;
};

/**
 * WAI-ARIA 탭 패턴: role=tablist/tab/tabpanel, 선택된 탭만 Tab 순서에 들어가고(roving tabindex)
 * 좌우 화살표 · Home · End 로 이동하면 바로 선택된다.
 */
export function Tabs({ label, tabs, active, onChange, prefix, children }: Props) {
  const move = (event: KeyboardEvent) => {
    const rtl = document.documentElement.dir === "rtl";
    const next = nextTabId(tabs.map((tab) => tab.id), active, event.key, rtl);
    if (next === null) return;
    event.preventDefault();
    onChange(next);
    document.getElementById(`${prefix}-tab-${next}`)?.focus();
  };

  return (
    <div className="grid gap-3">
      <div role="tablist" aria-label={label} onKeyDown={move} className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`${prefix}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${prefix}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              data-testid={`${prefix}-tab-${tab.id}`}
              className={cn(
                "-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                selected ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
              )}
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        id={`${prefix}-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`${prefix}-tab-${active}`}
        tabIndex={0}
        data-testid={`${prefix}-panel-${active}`}
        className="grid min-w-0 content-start gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {children}
      </div>
    </div>
  );
}
