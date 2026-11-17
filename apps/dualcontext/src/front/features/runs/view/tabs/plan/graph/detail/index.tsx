import type { PlanItem } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../i18n";
import { neighborsOf } from "../layout";
import { NodeBody, NodeHead } from "../../tree/node";
import { RSC } from "../resource";

type Props = { items: PlanItem[]; item: PlanItem; onSelect: (id: string) => void; t: Texts };

function Linked({ label, list, onSelect, testid, t }: { label: string; list: PlanItem[]; onSelect: (id: string) => void; testid: string; t: Texts }) {
  return (
    <div className="grid gap-1">
      <h5 className="text-xs font-semibold text-muted">{label}</h5>
      {list.length === 0 ? (
        <p className="text-muted" data-testid={`${testid}-none`}>{t[RSC.RUNS_PLAN_GRAPH_NONE_TEXT]}</p>
      ) : (
        <ul data-testid={testid} className="flex flex-wrap gap-2">
          {list.map((other) => (
            <li key={other.id}>
              <button type="button" data-item-id={other.id} onClick={() => onSelect(other.id)} className="rounded border border-line px-2 py-0.5 text-start text-accent underline">{other.name}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 그래프에서 고른 아이템의 상세: 머리 · 먼저 필요한 아이템 · 이 아이템을 필요로 하는 아이템 · 설명 · 컨텍스트 · 조사원 쌍. 이웃 이름은 눌러서 따라갈 수 있다. */
export function GraphDetail({ items, item, onSelect, t }: Props) {
  const { needs, dependents } = neighborsOf(items, item.id);
  return (
    <section aria-labelledby="plan-graph-detail-heading" data-testid="plan-graph-detail" data-item-id={item.id} className="grid gap-2 rounded-md border border-line p-3 text-sm">
      <h4 id="plan-graph-detail-heading" className="text-xs font-semibold text-muted">{t[RSC.RUNS_PLAN_GRAPH_DETAIL_HEADING_TEXT]}</h4>
      <NodeHead item={item} t={t} scope="plan-graph-detail" />
      <Linked label={t[RSC.RUNS_PLAN_GRAPH_NEEDS_LABEL]} list={needs} onSelect={onSelect} testid="plan-graph-detail-needs" t={t} />
      <Linked label={t[RSC.RUNS_PLAN_GRAPH_DEPENDENTS_LABEL]} list={dependents} onSelect={onSelect} testid="plan-graph-detail-dependents" t={t} />
      <NodeBody item={item} t={t} scope="plan-graph-detail" />
    </section>
  );
}
