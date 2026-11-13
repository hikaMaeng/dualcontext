import { useEffect, useState, type FormEvent } from "react";
import type { Answers, AugmentResult, WriterConfig } from "dualcontext_domain/common";
import { AnswerCompare } from "../../components/answers";
import { Button } from "../../components/ui/button";
import { Input, Select } from "../../components/ui/input";
import { Field } from "../../components/layout";
import { api } from "../../lib/api";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { RSC } from "./resource";

/** MCP 도구와 같은 증강 경로를 관리자가 직접 시험한다. 라이터를 골라 돌려 볼 수 있다. */
export function TryView({ t }: { t: Texts }) {
  const [query, setQuery] = useState("");
  const [writers, setWriters] = useState<WriterConfig[]>([]);
  const [writerId, setWriterId] = useState("");
  const [result, setResult] = useState<(AugmentResult & { runId: number; answers: Answers }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<WriterConfig[]>("/writers").then(setWriters).catch(() => setFailed(true));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      setResult(await api<AugmentResult & { runId: number; answers: Answers }>("/augment", { method: "POST", body: { query, ...(writerId ? { writerId: Number(writerId) } : {}) } }));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

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
        <Button type="submit" disabled={busy} className="justify-self-start">{t[RSC.TRY_RUN_BUTTON]}</Button>
      </form>
      {busy && <p role="status" data-testid="busy-state" className="text-sm text-muted">{t[RSC.TRY_BUSY_STATUS]}</p>}
      {failed && <p role="alert" className="text-sm text-danger">{t[SHARED.COMMON_ERROR_ALERT]}</p>}
      {result && (
        <>
          <p role="status" data-testid="routing-state" className="text-sm text-muted">{t[RSC.TRY_ROUTING_LABEL]}: {result.researcherRouting}</p>
          <p role="status" data-testid="logged-state" className="text-sm text-muted">
            <a className="text-accent underline" href="#runs">{t[RSC.TRY_LOGGED_STATUS]} #{result.runId}</a>
          </p>
          <AnswerCompare answers={result.answers} t={t} />
          <ul aria-label={t[RSC.TRY_PAIRS_LABEL]} className="grid gap-1 text-sm text-muted">
            {result.pairs.map((pair, index) => (
              <li key={index} data-testid="pair-item">{pair.researcher} / {pair.procedure ?? "-"} ({pair.materialCount}) [{pair.procedureRouting}]</li>
            ))}
          </ul>
          <pre aria-label={t[RSC.TRY_RESULT_LABEL]} data-testid="augmented-context" className="whitespace-pre-wrap rounded-md border border-line bg-sidebar p-4 font-mono text-sm">
            {result.context}
          </pre>
        </>
      )}
    </section>
  );
}
