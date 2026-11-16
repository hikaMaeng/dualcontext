import { useEffect, useState, type FormEvent } from "react";
import type { WriterConfig } from "dualcontext_domain/common";
import { AnswerCompare } from "../../components/answers";
import { PlanProgressLine } from "../../components/plan-progress";
import { RoutingScores } from "../../components/routing-scores";
import { RoutingSteps } from "../../components/routing-steps";
import { Button } from "../../components/ui/button";
import { Input, Select } from "../../components/ui/input";
import { Field } from "../../components/layout";
import { api } from "../../lib/api";
import { useRun } from "../../lib/run";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { ModeSelect, type ModeOverride } from "./mode";
import { RSC } from "./resource";

/**
 * MCP 도구와 같은 증강 경로를 관리자가 직접 시험한다. 실행은 서버에서 비동기로 돌고(수 분 걸릴 수 있다),
 * 이 화면은 runId 를 받아 진행을 따라간다: 라우팅 · 컨텍스트가 만들어지는 대로, 증강 전/후 답변이 끝나는 대로 채워진다.
 * 컨텍스트 모드는 저장된 계획 설정을 따르거나 이번 실행에만 다른 모드를 고를 수 있다(계획 과정은 실행 로그의 「계획」 탭에서 본다).
 */
export function TryView({ t }: { t: Texts }) {
  const [query, setQuery] = useState("");
  const [writers, setWriters] = useState<WriterConfig[]>([]);
  const [writerId, setWriterId] = useState("");
  const [mode, setMode] = useState<ModeOverride>("");
  const [runId, setRunId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const run = useRun(runId);

  useEffect(() => {
    api<WriterConfig[]>("/writers").then(setWriters).catch(() => setStartFailed(true));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStarting(true);
    setStartFailed(false);
    try {
      const started = await api<{ runId: number }>("/augment", { method: "POST", body: { query, ...(writerId ? { writerId: Number(writerId) } : {}), ...(mode ? { mode } : {}) } });
      setRunId(started.runId);
    } catch {
      setStartFailed(true);
    } finally {
      setStarting(false);
    }
  };

  const running = run?.status === "running";
  // 증강 단계(라우팅 · 수집 · 컨텍스트)가 끝났는가. 조사원이 하나도 선택되지 않아 쌍이 0개여도 끝난 것이다.
  const augmentDone = run !== null && (run.stage === "answering" || run.stage === "done");

  return (
    <section aria-labelledby="page-title" className="grid gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">{t[RSC.TRY_TITLE_TEXT]}</h1>
      <form onSubmit={submit} className="grid gap-3" aria-labelledby="page-title">
        <Field label={t[RSC.TRY_QUERY_LABEL]}><Input required value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
        <Field label={t[RSC.TRY_WRITER_LABEL]}>
          <Select value={writerId} onChange={(e) => setWriterId(e.target.value)}>
            <option value="">{t[RSC.TRY_WRITER_ACTIVE_TEXT]}</option>
            {writers.map((writer) => <option key={writer.id} value={writer.id}>{writer.name}</option>)}
          </Select>
        </Field>
        <ModeSelect value={mode} t={t} onChange={setMode} />
        <Button type="submit" disabled={starting} className="justify-self-start">{t[RSC.TRY_RUN_BUTTON]}</Button>
      </form>
      {startFailed && <p role="alert" className="text-sm text-danger">{t[SHARED.COMMON_ERROR_ALERT]}</p>}
      {runId !== null && (
        <>
          <p role="status" data-testid="logged-state" className="text-sm text-muted">
            <a className="text-accent underline" href="#runs">{t[RSC.TRY_LOGGED_STATUS]} #{runId}</a>
          </p>
          {running && (
            <p role="status" data-testid="busy-state" className="text-sm text-muted">
              {run?.stage === "answering" ? t[RSC.TRY_STAGE_ANSWERING_STATUS] : t[RSC.TRY_STAGE_AUGMENT_STATUS]} {t[RSC.TRY_BUSY_STATUS]}
            </p>
          )}
          {run && <PlanProgressLine run={run} t={t} />}
          {run?.status === "error" && <p role="alert" data-testid="run-error" className="text-sm text-danger">{t[RSC.TRY_FAILED_ALERT]}: {run.error}</p>}
          {run && augmentDone && (
            <>
              <p role="status" data-testid="routing-state" className="text-sm text-muted">{t[RSC.TRY_ROUTING_LABEL]}: {run.researcherRouting}</p>
              {run.pairs.length === 0 && <p role="status" data-testid="routing-none" className="text-sm text-fg">{t[SHARED.COMMON_ROUTING_NONE_MESSAGE]}</p>}
              <RoutingSteps routing={run.routing} t={t} />
              <RoutingScores routing={run.routing} t={t} />
              <AnswerCompare answers={run.answers} pending={running} t={t} />
              <ul aria-label={t[RSC.TRY_PAIRS_LABEL]} className="grid gap-1 text-sm text-muted">
                {run.pairs.map((pair, index) => (
                  <li key={index} data-testid="pair-item" data-item={pair.item}>{pair.item && <span data-testid="pair-item-name" className="me-1 rounded border border-line px-1 text-xs">{pair.item}</span>}{pair.researcher} / {pair.procedure ?? "-"} ({pair.materialCount}) [{pair.procedureRouting}]</li>
                ))}
              </ul>
              {run.context && (
                <pre aria-label={t[RSC.TRY_RESULT_LABEL]} data-testid="augmented-context" className="whitespace-pre-wrap rounded-md border border-line bg-sidebar p-4 font-mono text-sm">
                  {run.context}
                </pre>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
