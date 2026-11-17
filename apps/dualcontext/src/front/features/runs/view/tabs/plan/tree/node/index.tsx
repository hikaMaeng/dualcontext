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

/** scope 는 data-testid 접두(기본 plan-node, 그래프 상세는 plan-graph-detail 처럼 따로 둬 같은 화면에서 겹치지 않게 한다). */
/** 노드 머리: 이름 · 단계 · 상태 배지 · 보강 라운드 · 소요. 반복 노드도 같은 머리를 쓴다(배지로 같은 아이템임을 알아보게). */
export function NodeHead({ item, t, scope = "plan-node" }: { item: PlanItem; t: Texts; scope?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-medium text-fg" data-testid={`${scope}-name`}>{item.name}</span>
      <span className="rounded border border-line px-1.5 text-xs text-muted" data-testid={`${scope}-level`}>{t[RSC.RUNS_PLAN_NODE_LEVEL_TEXT]} {item.level}</span>
      <span className={cn("rounded border px-1.5 text-xs", statusTone[item.status] ?? statusTone.pending)} data-testid={`${scope}-status`}>{itemStatusText(item.status, t)}</span>
      {item.round > 0 && <span className="rounded border border-accent px-1.5 text-xs text-accent" data-testid={`${scope}-round`}>{t[RSC.RUNS_PLAN_NODE_ROUND_TEXT]} {item.round}</span>}
      {item.ms !== undefined && <span className="text-xs text-muted">{formatSeconds(item.ms)}{t[ROOT.COMMON_SECONDS_TEXT]}</span>}
    </span>
  );
}

/** 노드를 펼치면 보이는 것: 설명, 오류, 생성된 컨텍스트(마크다운), 이 아이템이 쓴 조사원 · 프로시저. */
export function NodeBody({ item, t, scope = "plan-node" }: { item: PlanItem; t: Texts; scope?: string }) {
  return (
    <div className="mt-2 grid gap-2 text-sm">
      {item.description && <p data-testid={`${scope}-description`} className="whitespace-pre-wrap text-muted">{item.description}</p>}
      {item.error && <p role="alert" data-testid={`${scope}-error`} className="text-danger">{t[RSC.RUNS_PLAN_NODE_ERROR_LABEL]}: {item.error}</p>}
      <section aria-label={t[RSC.RUNS_PLAN_NODE_CONTEXT_LABEL]} className="grid gap-1">
        <h5 className="text-xs font-semibold text-muted">{t[RSC.RUNS_PLAN_NODE_CONTEXT_LABEL]}</h5>
        {item.context ? (
          <div data-testid={`${scope}-context`} className="max-h-96 overflow-auto break-words rounded-md border border-line bg-sidebar p-3 leading-6">
            <MarkdownText text={item.context} />
          </div>
        ) : (
          <p data-testid={`${scope}-context-empty`} className="text-muted">{t[RSC.RUNS_PLAN_NODE_CONTEXT_EMPTY_MESSAGE]}</p>
        )}
      </section>
      <section aria-label={t[RSC.RUNS_PLAN_NODE_PAIRS_LABEL]} className="grid gap-1">
        <h5 className="text-xs font-semibold text-muted">{t[RSC.RUNS_PLAN_NODE_PAIRS_LABEL]}</h5>
        {(item.pairs ?? []).length === 0 ? (
          <p className="text-muted" data-testid={`${scope}-pairs-empty`}>{t[RSC.RUNS_PLAN_NODE_PAIRS_EMPTY_MESSAGE]}</p>
        ) : (
          <ul data-testid={`${scope}-pairs`} className="grid gap-0.5 text-muted">
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
