import type { PlanStep } from "dualcontext_domain/common";
import { planStopText } from "../../../../../../../components/plan-labels";
import { SeedRow } from "../../rows/seed";
import { CallList } from "../../parts/calls";
import { DedupeCalls } from "../../parts/dedupe-calls";
import { NodeLink } from "../../parts/node-link";
import { Section } from "../../parts/section";
import { neighborsOf } from "../../../model";
import type { KindProps } from "../../types";
import { RSC } from "./resource";

/**
 * 평가 노드(라운드 r): 점수와 통과 판정(통과 조건: 점수 ≥ passScore, 부족 개수 ≤ maxMissing), 평가 이유, 부족하다고 본 컨텍스트(이름 · 설명 · 이유),
 * 이 평가가 일으킨 다음 분류 그래프(추가된 아이템 링크 · 후보 정리 결과), 마지막 평가라면 계획이 멈춘 이유, 사용한 프롬프트와 평가 모델 응답 원문.
 */
export function EvaluateBody({ run, graph, node, doc, running, onSelect, t }: KindProps) {
  const plan = run.plan;
  const round = node.round !== undefined ? plan?.rounds[node.round] : undefined;
  const evaluation = round?.evaluation ?? null;
  const rule = plan?.limits.reevaluate;
  const { outputs } = neighborsOf(graph, node.id);
  const next = outputs.filter((n) => n.kind === "item");
  const seed = (plan?.steps ?? []).find((step): step is Extract<PlanStep, { kind: "seed" }> => step.kind === "seed" && step.source === "evaluation" && step.round === (node.round ?? 0) + 1);
  const isLast = plan !== null && plan !== undefined && node.round === plan.rounds.length - 1;
  return (
    <>
      <Section title={t[RSC.RUNS_NODE_EVALUATE_JUDGEMENT_LABEL]} testId="run-node-evaluate-judgement">
        {evaluation ? (
          <>
            <p data-testid="run-node-evaluate-score" data-pass={String(evaluation.pass)} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{t[RSC.RUNS_NODE_EVALUATE_SCORE_LABEL]}: <strong>{evaluation.score}</strong></span>
              <span className={evaluation.pass ? "rounded border border-accent px-1.5 text-xs text-accent" : "rounded border border-danger px-1.5 text-xs text-danger"}>
                {evaluation.pass ? t[RSC.RUNS_NODE_EVALUATE_PASS_TEXT] : t[RSC.RUNS_NODE_EVALUATE_FAIL_TEXT]}
              </span>
              <span className="text-muted">{t[RSC.RUNS_NODE_EVALUATE_MISSING_COUNT_LABEL]}: {evaluation.missing.length}</span>
            </p>
            {rule && <p data-testid="run-node-evaluate-rule" className="text-xs text-muted">{t[RSC.RUNS_NODE_EVALUATE_RULE_LABEL]}: {t[RSC.RUNS_NODE_EVALUATE_SCORE_LABEL]} ≥ {rule.passScore} · {t[RSC.RUNS_NODE_EVALUATE_MISSING_COUNT_LABEL]} ≤ {rule.maxMissing}</p>}
            {evaluation.reason && <p data-testid="run-node-evaluate-reason"><span className="text-muted">{t[RSC.RUNS_NODE_EVALUATE_REASON_LABEL]}: </span>{evaluation.reason}</p>}
          </>
        ) : round?.evaluationError ? (
          <p role="alert" data-testid="run-node-evaluate-error" className="text-danger">{t[RSC.RUNS_NODE_EVALUATE_ERROR_LABEL]}: {round.evaluationError}</p>
        ) : (
          <p role="status" className="text-muted">{running ? t[RSC.RUNS_NODE_EVALUATE_PENDING_MESSAGE] : "-"}</p>
        )}
        {isLast && plan?.stop && <p data-testid="run-node-evaluate-stop" className="text-sm"><span className="text-muted">{t[RSC.RUNS_NODE_EVALUATE_STOP_LABEL]}: </span>{planStopText(plan.stop, t)}</p>}
      </Section>
      {evaluation && (
        <Section title={`${t[RSC.RUNS_NODE_EVALUATE_MISSING_LABEL]} (${evaluation.missing.length})`} testId="run-node-evaluate-missing">
          {evaluation.missing.length === 0 ? (
            <p className="text-muted">{t[RSC.RUNS_NODE_EVALUATE_MISSING_NONE_MESSAGE]}</p>
          ) : (
            <ul className="grid gap-2">
              {evaluation.missing.map((missing, index) => (
                <li key={index} data-testid="run-node-evaluate-missing-entry">
                  <strong className="text-fg">{missing.name}</strong>
                  {missing.description && <span className="text-muted"> · {missing.description}</span>}
                  {missing.reason && <span className="block text-xs text-muted">{t[RSC.RUNS_NODE_EVALUATE_MISSING_REASON_LABEL]}: {missing.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      <Section title={t[RSC.RUNS_NODE_EVALUATE_NEXT_LABEL]} testId="run-node-evaluate-next">
        {next.length === 0 ? (
          <p className="text-muted">{t[RSC.RUNS_NODE_EVALUATE_NEXT_NONE_MESSAGE]}</p>
        ) : (
          <ul data-testid="run-node-evaluate-next-items" className="flex flex-wrap gap-2">{next.map((n) => <li key={n.id}><NodeLink id={n.id} name={n.item?.name ?? n.id} onSelect={onSelect} /></li>)}</ul>
        )}
        {seed && (
          <div className="grid gap-1">
            <h5 className="text-xs font-semibold text-muted">{t[RSC.RUNS_NODE_EVALUATE_SEED_LABEL]}</h5>
            <SeedRow step={seed} items={plan?.items ?? []} t={t} />
          </div>
        )}
      </Section>
      <CallList calls={doc.doc?.calls ?? []} testId="run-node-evaluate-calls" t={t} />
      <DedupeCalls run={run} round={(node.round ?? 0) + 1} title={t[RSC.RUNS_NODE_EVALUATE_DEDUPE_LABEL]} t={t} />
    </>
  );
}
