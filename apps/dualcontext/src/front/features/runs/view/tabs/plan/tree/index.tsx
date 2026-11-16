import type { PlanItem } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../i18n";
import { buildPlanTree, type PlanTreeNode } from "../model";
import { NodeBody, NodeHead } from "./node";
import { RSC } from "./resource";

/**
 * 의존성 트리: top 아이템을 루트로 needs 를 들여쓴다. 각 노드는 <details> 라 클릭(Enter · Space)으로 펼치면 설명 · 컨텍스트 · 쌍이 보인다.
 * 공유되는 사전 아이템은 처음 자리에서만 펼치고 이후 자리는 「위에 나옴」으로 접는다(구성 규칙은 model/buildPlanTree).
 */
export function PlanTree({ items, t }: { items: PlanItem[]; t: Texts }) {
  const roots = buildPlanTree(items);
  return (
    <section aria-labelledby="plan-tree-heading" className="grid gap-1">
      <h3 id="plan-tree-heading" className="text-sm font-semibold text-muted">{t[RSC.RUNS_PLAN_TREE_HEADING_TEXT]}</h3>
      {roots.length === 0 ? (
        <p role="status" data-testid="plan-tree-empty" className="text-sm text-muted">{t[RSC.RUNS_PLAN_TREE_EMPTY_MESSAGE]}</p>
      ) : (
        <ul data-testid="plan-tree" aria-labelledby="plan-tree-heading" className="grid gap-1">
          {roots.map((node) => <TreeNode key={node.key} node={node} t={t} />)}
        </ul>
      )}
    </section>
  );
}

function TreeNode({ node, t }: { node: PlanTreeNode; t: Texts }) {
  if (node.kind === "unknown") {
    return (
      <li data-testid="plan-node-unknown" data-item-id={node.id} data-depth={node.depth} className="rounded-md border border-dashed border-line p-2 text-sm text-muted">
        {node.id} · {t[RSC.RUNS_PLAN_TREE_UNKNOWN_TEXT]}
      </li>
    );
  }
  if (node.kind === "repeat") {
    return (
      <li data-testid="plan-node-repeat" data-item-id={node.item.id} data-depth={node.depth} className="rounded-md border border-dashed border-line p-2 text-sm">
        <NodeHead item={node.item} t={t} />
        <span className="ms-2 text-xs text-muted" data-testid="plan-node-repeat-note">{t[RSC.RUNS_PLAN_TREE_REPEAT_TEXT]}</span>
      </li>
    );
  }
  const { item, children } = node;
  return (
    <li
      data-testid={`plan-node-${item.id}`}
      data-item-id={item.id}
      data-status={item.status}
      data-level={item.level}
      data-round={item.round}
      data-depth={node.depth}
      className="grid gap-1"
    >
      <details className="rounded-md border border-line p-2 text-sm">
        <summary className="cursor-pointer"><NodeHead item={item} t={t} /></summary>
        <NodeBody item={item} t={t} />
      </details>
      {children.length > 0 && (
        <ul aria-label={`${item.name} · ${t[RSC.RUNS_PLAN_TREE_NEEDS_LABEL]}`} className="grid gap-1 border-s border-line ps-4">
          {children.map((child) => <TreeNode key={child.key} node={child} t={t} />)}
        </ul>
      )}
    </li>
  );
}
