import type { PlanItem, PlanStep } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../i18n";
import { NodeLink } from "../node-link";
import { buildDecomposeMap } from "./model";
import { RSC } from "./resource";

type Props = { items: PlanItem[]; steps: PlanStep[]; onSelect: (id: string) => void; t: Texts };

/**
 * 질의 분해 → 분해된 질의별 필요 컨텍스트. 위쪽은 분해 질의마다 「먼저 필요한 컨텍스트」(여럿이 같은 것을 필요로 하면 공유 표시),
 * 아래쪽은 사전 컨텍스트마다 「어느 질의가 직 · 간접으로 기대는가」와 「어떤 사전 요구 후보들이 이것 하나로 합쳐졌는가」다.
 * 그래서 질의 5개에서 사전 컨텍스트가 1개만 나온 이유(후보가 같은 것으로 정리됨)가 이 구역에서 읽힌다.
 */
export function DecomposeMap({ items, steps, onSelect, t }: Props) {
  const { entries, merged } = buildDecomposeMap(items, steps);
  if (entries.length === 0) return null;
  return (
    <div data-testid="decompose-map" className="grid gap-3">
      <p className="text-muted">{t[RSC.RUNS_NODE_ANALYZE_MAP_SUMMARY_LABEL]}: {entries.length} → {merged.length}</p>
      <ul className="grid gap-2">
        {entries.map((entry) => (
          <li key={entry.item.id} data-testid="decompose-map-query" data-item-id={entry.item.id} className="grid gap-1 rounded-md border border-line p-2">
            <strong className="text-fg">{entry.item.name}</strong>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs text-muted">{t[RSC.RUNS_NODE_ANALYZE_MAP_NEEDS_LABEL]}</span>
              {entry.needs.length === 0 && <span className="text-xs text-muted">{t[RSC.RUNS_NODE_ANALYZE_MAP_NONE_TEXT]}</span>}
              {entry.needs.map((need) => (
                <span key={need.item.id} className="inline-flex items-center gap-1">
                  <NodeLink id={need.item.id} name={need.item.name} onSelect={onSelect} />
                  {need.sharedBy > 1 && <span className="rounded border border-line px-1.5 text-xs text-muted">{t[RSC.RUNS_NODE_ANALYZE_MAP_SHARED_TEXT]} {need.sharedBy}</span>}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {merged.length > 0 && <h5 className="text-xs font-semibold text-muted">{t[RSC.RUNS_NODE_ANALYZE_MAP_MERGED_LABEL]}</h5>}
      <ul className="grid gap-2">
        {merged.map((entry) => (
          <li key={entry.item.id} data-testid="decompose-map-merged" data-item-id={entry.item.id} className="grid gap-1 rounded-md border border-line p-2">
            <NodeLink id={entry.item.id} name={entry.item.name} onSelect={onSelect} />
            <p className="text-xs text-muted">{t[RSC.RUNS_NODE_ANALYZE_MAP_REACHED_LABEL]}: {entry.reachedBy.map((top) => top.name).join(", ") || "-"}</p>
            <div className="grid gap-0.5 text-xs">
              <span className="text-muted">{t[RSC.RUNS_NODE_ANALYZE_MAP_SOURCES_LABEL]}</span>
              {entry.sources.length === 0 && <span className="text-muted">{t[RSC.RUNS_NODE_ANALYZE_MAP_NOSOURCE_MESSAGE]}</span>}
              {entry.sources.map((source, index) => (
                <span key={index}><strong className="text-fg">{source.owner?.name ?? source.ownerId}</strong> → {source.name}</span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
