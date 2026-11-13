import { useEffect, useState } from "react";
import { AnswerCompare } from "../../components/answers";
import { RoutingScores } from "../../components/routing-scores";
import { Button } from "../../components/ui/button";
import { ListDetail } from "../../components/layout";
import { api } from "../../lib/api";
import { useRun, type RunStatus } from "../../lib/run";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { RSC } from "./resource";

type RunRow = {
  id: number;
  createdAt: string;
  query: string;
  status: RunStatus;
  durationMs: number;
};

const when = (iso: string) => new Date(iso).toLocaleString();

/**
 * 시험 실행 로그: 왼쪽 목록, 오른쪽 상세. 상세에는 실행 당시 설정 스냅샷과 선택된 쌍 · 근거 자료가 들어 있다.
 * 진행 중인 실행은 상세가 SSE(끊기면 폴링)로 실시간 갱신되고, 목록은 진행 중인 것이 있는 동안 주기적으로 새로 읽는다.
 */
export function RunsView({ t }: { t: Texts }) {
  const [items, setItems] = useState<RunRow[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const detail = useRun(selected);

  const load = async () => {
    try {
      setItems(await api<RunRow[]>("/runs"));
    } catch {
      setFailed(true);
    }
  };
  useEffect(() => void load(), []);

  const anyRunning = items.some((item) => item.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [anyRunning]);

  // 선택한 실행이 끝나면 목록의 상태 표시도 바로 갱신한다.
  const detailStatus = detail?.status;
  useEffect(() => {
    if (detailStatus && detailStatus !== "running") void load();
  }, [detailStatus]);

  const remove = async () => {
    if (!detail) return;
    try {
      await api(`/runs/${detail.id}`, { method: "DELETE" });
      setSelected(null);
      await load();
    } catch {
      setFailed(true);
    }
  };

  const statusText = (status: RunStatus) =>
    status === "running" ? t[RSC.RUNS_RUNNING_STATUS] : status === "ok" ? t[RSC.RUNS_OK_STATUS] : t[RSC.RUNS_FAILED_ALERT];
  const running = detail?.status === "running";
  const augmentDone = detail !== null && (detail.stage === "answering" || detail.stage === "done");

  return (
    <section aria-labelledby="page-title" className="grid gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">{t[RSC.RUNS_TITLE_TEXT]}</h1>
      {failed && <p role="alert" className="text-sm text-danger">{t[SHARED.COMMON_ERROR_ALERT]}</p>}
      <ListDetail
        listLabel={t[SHARED.COMMON_LIST_LABEL]}
        list={
          <>
            {items.length === 0 && <li className="text-sm text-muted">{t[SHARED.COMMON_EMPTY_MESSAGE]}</li>}
            {items.map((item) => (
              <li key={item.id}>
                <Button variant="ghost" size="sm" className="h-auto w-full min-w-0 flex-col items-start gap-0.5 overflow-hidden py-2 text-start" aria-current={selected === item.id ? "page" : undefined} data-testid="run-item" data-status={item.status} onClick={() => setSelected(item.id)}>
                  <span className="text-xs text-muted">#{item.id} · {when(item.createdAt)} · {statusText(item.status)}</span>
                  <span className="w-full min-w-0 truncate">{item.query}</span>
                </Button>
              </li>
            ))}
          </>
        }
        form={
          detail && (
            <article aria-labelledby="run-heading" className="grid gap-4" data-testid="run-detail" data-status={detail.status}>
              <div className="flex items-center justify-between gap-3">
                <h2 id="run-heading" className="text-lg font-semibold">{t[RSC.RUNS_DETAIL_HEADING_TEXT]} #{detail.id}</h2>
                {!running && <Button variant="outline" size="sm" className="text-danger" onClick={() => void remove()}>{t[SHARED.COMMON_DELETE_BUTTON]}</Button>}
              </div>
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted">{t[RSC.RUNS_QUERY_LABEL]}</dt>
                <dd>{detail.query}</dd>
                <dt className="text-muted">{t[RSC.RUNS_TIME_LABEL]}</dt>
                <dd>{when(detail.createdAt)}</dd>
                <dt className="text-muted">{t[RSC.RUNS_DURATION_LABEL]}</dt>
                <dd>{running ? "-" : (detail.durationMs / 1000).toFixed(1)}</dd>
                <dt className="text-muted">{t[RSC.RUNS_ROUTING_LABEL]}</dt>
                <dd data-testid="run-routing">{detail.researcherRouting ?? "-"}</dd>
                <dt className="text-muted">{t[RSC.RUNS_OK_STATUS]}</dt>
                <dd role="status" data-testid="run-status">
                  {running ? (detail.stage === "answering" ? t[RSC.RUNS_STAGE_ANSWERING_STATUS] : t[RSC.RUNS_STAGE_AUGMENT_STATUS]) : statusText(detail.status)}
                </dd>
              </dl>
              {detail.error && (
                <p role="alert" className="rounded-md border border-line p-3 text-sm text-danger">{t[RSC.RUNS_FAILURE_LABEL]}: {detail.error}</p>
              )}
              {augmentDone && detail.pairs.length === 0 && <p role="status" data-testid="run-routing-none" className="text-sm">{t[SHARED.COMMON_ROUTING_NONE_MESSAGE]}</p>}
              {(detail.answers || running) && <AnswerCompare answers={detail.answers} pending={running && augmentDone} t={t} />}
              <RoutingScores routing={detail.routing} t={t} />
              <section aria-label={t[RSC.RUNS_SETTINGS_LABEL]} className="grid gap-1">
                <h3 className="text-sm font-semibold text-muted">{t[RSC.RUNS_SETTINGS_LABEL]}</h3>
                <pre data-testid="run-settings" className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-sidebar p-3 font-mono text-xs">{JSON.stringify(detail.settings, null, 2)}</pre>
              </section>
              <section aria-label={t[RSC.RUNS_PAIRS_LABEL]} className="grid gap-2">
                <h3 className="text-sm font-semibold text-muted">{t[RSC.RUNS_PAIRS_LABEL]}</h3>
                {detail.pairs.map((pair, index) => (
                  <details key={index} data-testid="run-pair" className="rounded-md border border-line p-3 text-sm">
                    <summary className="cursor-pointer">
                      {pair.researcher} / {pair.procedure ?? "-"} ({pair.materialCount}) [{pair.procedureRouting}]
                    </summary>
                    {pair.error && <p role="alert" className="mt-2 text-danger">{pair.error}</p>}
                    <ul aria-label={t[RSC.RUNS_MATERIALS_LABEL]} className="mt-2 grid gap-2">
                      {pair.materials.map((material, at) => (
                        <li key={at} className="text-muted"><strong className="text-fg">{material.title}</strong> {material.text}</li>
                      ))}
                    </ul>
                  </details>
                ))}
              </section>
              {detail.context && (
                <section aria-label={t[RSC.RUNS_CONTEXT_LABEL]} className="grid gap-1">
                  <h3 className="text-sm font-semibold text-muted">{t[RSC.RUNS_CONTEXT_LABEL]}</h3>
                  <pre data-testid="run-context" className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-sidebar p-3 font-mono text-sm">{detail.context}</pre>
                </section>
              )}
            </article>
          )
        }
      />
    </section>
  );
}
