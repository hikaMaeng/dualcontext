import { runNodeKey, type PlanStep } from "dualcontext_domain/common";
import { itemStatusText } from "../../../../../../../components/plan-labels";
import { RSC as ROOT } from "../../../../../../../resource";
import { formatSeconds } from "../../../../../format";
import { neighborsOf } from "../../../model";
import { BuildRow } from "../../rows/build";
import { DedupeRow } from "../../rows/dedupe";
import { PrerequisitesRow } from "../../rows/prerequisites";
import { AugmentDetail } from "../../parts/augment-detail";
import { CallList } from "../../parts/calls";
import { ContextBox } from "../../parts/context";
import { RSC as CONTEXT } from "../../parts/context/resource";
import { DedupeCalls } from "../../parts/dedupe-calls";
import { NodeLink } from "../../parts/node-link";
import { Section } from "../../parts/section";
import { TextBox } from "../../parts/text-box";
import type { KindProps } from "../../types";
import { RSC } from "./resource";

/**
 * 컨텍스트 아이템 노드: ① 개요(설명 · 단계 · 라운드 · 웨이브 · 앞뒤 아이템 링크) ② 의존성 분석(이 아이템이 먼저 필요로 한다고 본 것과 그 정리,
 * 프롬프트) ③ 이전 참고 컨텍스트(사전 아이템에서 건네받은 글자 수와 본문) ④ 라우팅 ⑤ 조사원 · 프로시저 · 자료 ⑥ 사용된 프롬프트 ⑦ 만들어진 컨텍스트.
 * 서버 상세 문서가 없으면(옛 실행 · 진행 중) 계획 기록과 실행 행의 쌍으로 보일 수 있는 것만 보인다.
 */
export function ItemBody({ run, graph, node, doc, onSelect, t }: KindProps) {
  const item = node.item;
  if (!item) return null;
  const items = run.plan?.items ?? [];
  const steps = run.plan?.steps ?? [];
  const augment = doc.doc?.augment;
  const { inputs, outputs } = neighborsOf(graph, node.id);
  const needs = inputs.filter((n) => n.kind === "item");
  const dependents = outputs.filter((n) => n.kind === "item");
  const prerequisites = steps.find((step): step is Extract<PlanStep, { kind: "prerequisites" }> => step.kind === "prerequisites" && step.item === item.id);
  // 이 아이템이 낸 사전 요구 후보가 들어 있는 중복 정리(그 단계 전체).
  const dedupes = steps.filter((step): step is Extract<PlanStep, { kind: "dedupe" }> => step.kind === "dedupe" && step.candidates.some((candidate) => candidate.owner === item.id));
  const build = steps.find((step): step is Extract<PlanStep, { kind: "build" }> => step.kind === "build" && step.item === item.id);
  const provided = doc.doc?.provided;
  const fallbackPairs = run.pairs.filter((pair) => pair.item === item.name);
  const list = (nodes: typeof needs) =>
    nodes.length === 0 ? <span className="text-muted">{t[RSC.RUNS_NODE_ITEM_NONE_TEXT]}</span> : <ul className="flex flex-wrap gap-2">{nodes.map((n) => <li key={n.id}><NodeLink id={n.id} name={n.item?.name ?? n.id} onSelect={onSelect} /></li>)}</ul>;
  return (
    <>
      <Section title={t[RSC.RUNS_NODE_ITEM_OVERVIEW_LABEL]} testId="run-node-item-overview">
        {item.description && <p data-testid="run-node-item-description" className="whitespace-pre-wrap text-muted">{item.description}</p>}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted">{t[RSC.RUNS_NODE_ITEM_STATUS_LABEL]}</dt>
          <dd>{itemStatusText(item.status, t)}{item.ms !== undefined ? ` · ${formatSeconds(item.ms)}${t[ROOT.COMMON_SECONDS_TEXT]}` : ""}</dd>
          <dt className="text-muted">{t[RSC.RUNS_NODE_ITEM_LEVEL_LABEL]}</dt>
          <dd>{item.level}</dd>
          <dt className="text-muted">{t[RSC.RUNS_NODE_ITEM_ROUND_LABEL]}</dt>
          <dd>{item.round}</dd>
          {build && (<><dt className="text-muted">{t[RSC.RUNS_NODE_ITEM_WAVE_LABEL]}</dt><dd>{build.wave}</dd></>)}
          <dt className="text-muted">{t[RSC.RUNS_NODE_ITEM_NEEDS_LABEL]}</dt>
          <dd data-testid="run-node-item-needs">{list(needs)}</dd>
          <dt className="text-muted">{t[RSC.RUNS_NODE_ITEM_DEPENDENTS_LABEL]}</dt>
          <dd data-testid="run-node-item-dependents">{list(dependents)}</dd>
        </dl>
        {item.error && <p role="alert" data-testid="run-node-item-error" className="text-danger">{t[RSC.RUNS_NODE_ITEM_ERROR_LABEL]}: {item.error}</p>}
      </Section>

      <Section title={t[RSC.RUNS_NODE_ITEM_DEPS_LABEL]} testId="run-node-item-deps">
        {prerequisites ? <PrerequisitesRow step={prerequisites} items={items} t={t} /> : <p className="text-muted">{t[RSC.RUNS_NODE_ITEM_DEPS_NONE_MESSAGE]}</p>}
        {dedupes.map((step) => <DedupeRow key={step.seq} step={step} items={items} t={t} />)}
      </Section>
      {doc.doc?.prerequisitesCalls && <CallList calls={doc.doc.prerequisitesCalls} testId="run-node-item-deps-calls" title={t[RSC.RUNS_NODE_ITEM_DEPS_CALLS_LABEL]} t={t} />}
      {dedupes.map((step) => <DedupeCalls key={`d${step.seq}`} run={run} round={step.round} level={step.level} title={t[RSC.RUNS_NODE_ITEM_DEDUPE_LABEL]} t={t} />)}

      <Section title={t[RSC.RUNS_NODE_ITEM_PROVIDED_LABEL]} testId="run-node-item-provided">
        {provided && provided.length > 0 ? (
          <ul className="grid gap-2">
            {provided.map((entry) => (
              <li key={entry.item} data-testid="run-node-item-provided-entry" data-item-id={entry.item} className="rounded-md border border-line p-2">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                    <NodeLink id={runNodeKey.item(entry.item)} name={entry.name} onSelect={onSelect} />
                    <span className="text-xs text-muted">{t[RSC.RUNS_NODE_ITEM_PROVIDED_CHARS_LABEL]} {entry.chars} · {t[RSC.RUNS_NODE_ITEM_PROVIDED_SENT_LABEL]} {entry.sent}</span>
                  </summary>
                  <div className="mt-2 grid gap-1">
                    <h5 className="text-xs font-semibold text-muted">{t[RSC.RUNS_NODE_ITEM_PROVIDED_TEXT_LABEL]}</h5>
                    <TextBox text={entry.text} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : build && build.provided.length > 0 ? (
          <BuildRow step={build} items={items} t={t} />
        ) : (
          <p className="text-muted">{t[RSC.RUNS_NODE_ITEM_PROVIDED_NONE_MESSAGE]}</p>
        )}
      </Section>

      <AugmentDetail
        run={run}
        routing={augment?.routing ?? null}
        pairs={augment?.pairs ?? fallbackPairs}
        researcherRouting={augment?.researcherRouting ?? null}
        testId="run-node-item"
        t={t}
      />
      <CallList calls={doc.doc?.calls ?? []} testId="run-node-item-calls" t={t} />
      <Section title={t[CONTEXT.RUNS_CONTEXT_LABEL]} testId="run-node-item-context">
        <ContextBox text={item.context || augment?.context} t={t} />
      </Section>
    </>
  );
}
