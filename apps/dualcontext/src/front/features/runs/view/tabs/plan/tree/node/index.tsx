import type { PlanItem } from "dualcontext_domain/common";
import { MarkdownText } from "../../../../../../../components/markdown";
import { itemStatusText } from "../../../../../../../components/plan-labels";
import type { Texts } from "../../../../../../../i18n";
import { cn } from "../../../../../../../lib/utils";
import { RSC as ROOT } from "../../../../../../../resource";
import { formatSeconds } from "../../../../../format";
import { RSC } from "./resource";

const statusTone: Record<string, string> = {
  built: "border-accent text-accent",
  empty: "border-line text-muted",
  error: "border-danger text-danger",
  pending: "border-line text-muted"
};

/** 노드 머리: 이름 · 단계 · 상태 배지 · 보강 라운드 · 소요. 반복 노드도 같은 머리를 쓴다(배지로 같은 아이템임을 알아보게). */
export function NodeHead({ item, t }: { item: PlanItem; t: Texts }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-medium text-fg" data-testid="plan-node-name">{item.name}</span>
      <span className="rounded border border-line px-1.5 text-xs text-muted" data-testid="plan-node-level">{t[RSC.RUNS_PLAN_NODE_LEVEL_TEXT]} {item.level}</span>
      <span className={cn("rounded border px-1.5 text-xs", statusTone[item.status] ?? statusTone.pending)} data-testid="plan-node-status">{itemStatusText(item.status, t)}</span>
      {item.round > 0 && <span className="rounded border border-accent px-1.5 text-xs text-accent" data-testid="plan-node-round">{t[RSC.RUNS_PLAN_NODE_ROUND_TEXT]} {item.round}</span>}
      {item.ms !== undefined && <span className="text-xs text-muted">{formatSeconds(item.ms)}{t[ROOT.COMMON_SECONDS_TEXT]}</span>}
    </span>
  );
}

/** 노드를 펼치면 보이는 것: 설명, 오류, 생성된 컨텍스트(마크다운), 이 아이템이 쓴 조사원 · 프로시저. */
export function NodeBody({ item, t }: { item: PlanItem; t: Texts }) {
  return (
    <div className="mt-2 grid gap-2 text-sm">
      {item.description && <p data-testid="plan-node-description" className="whitespace-pre-wrap text-muted">{item.description}</p>}
      {item.error && <p role="alert" data-testid="plan-node-error" className="text-danger">{t[RSC.RUNS_PLAN_NODE_ERROR_LABEL]}: {item.error}</p>}
      <section aria-label={t[RSC.RUNS_PLAN_NODE_CONTEXT_LABEL]} className="grid gap-1">
        <h5 className="text-xs font-semibold text-muted">{t[RSC.RUNS_PLAN_NODE_CONTEXT_LABEL]}</h5>
        {item.context ? (
          <div data-testid="plan-node-context" className="max-h-96 overflow-auto break-words rounded-md border border-line bg-sidebar p-3 leading-6">
            <MarkdownText text={item.context} />
          </div>
        ) : (
          <p data-testid="plan-node-context-empty" className="text-muted">{t[RSC.RUNS_PLAN_NODE_CONTEXT_EMPTY_MESSAGE]}</p>
        )}
      </section>
      <section aria-label={t[RSC.RUNS_PLAN_NODE_PAIRS_LABEL]} className="grid gap-1">
        <h5 className="text-xs font-semibold text-muted">{t[RSC.RUNS_PLAN_NODE_PAIRS_LABEL]}</h5>
        {(item.pairs ?? []).length === 0 ? (
          <p className="text-muted" data-testid="plan-node-pairs-empty">{t[RSC.RUNS_PLAN_NODE_PAIRS_EMPTY_MESSAGE]}</p>
        ) : (
          <ul data-testid="plan-node-pairs" className="grid gap-0.5 text-muted">
            {item.pairs.map((pair, index) => (
              <li key={index}>
                {pair.researcher} / {pair.procedure ?? "-"} ({pair.materialCount}) [{pair.procedureRouting}]
                {pair.error && <span className="ms-2 text-danger">{pair.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
