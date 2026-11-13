import { useState, type FormEvent } from "react";
import type { AugmentResult } from "dualcontext_domain/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { api } from "../../lib/api";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { RSC } from "./resource";

/** MCP 도구와 같은 증강 경로를 관리자가 직접 시험한다. */
export function TryView({ t }: { t: Texts }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AugmentResult | null>(null);
  const [failed, setFailed] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    api<AugmentResult>("/augment", { method: "POST", body: { query } })
      .then((next) => {
        setResult(next);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  };

  const routingStatus = {
    matched: t[RSC.TRY_ROUTING_MATCHED_STATUS],
    "fallback-all": t[RSC.TRY_ROUTING_FALLBACK_STATUS],
    none: t[RSC.TRY_ROUTING_NONE_STATUS]
  };

  return (
    <section aria-labelledby="try-title" className="grid gap-4">
      <h2 id="try-title" className="text-xl font-semibold">
        {t[RSC.TRY_TITLE_TEXT]}
      </h2>
      <form onSubmit={submit} className="grid gap-3" aria-labelledby="try-title">
        <label className="grid gap-1 text-sm">
          {t[RSC.TRY_QUERY_LABEL]}
          <Input required value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <Button type="submit" className="justify-self-start">
          {t[RSC.TRY_RUN_BUTTON]}
        </Button>
      </form>
      {failed && <p role="alert" className="text-sm text-red-700">{t[SHARED.COMMON_ERROR_ALERT]}</p>}
      {result && (
        <>
          <p role="status" data-testid="routing-state" className="text-sm text-slate-700">
            {routingStatus[result.researcherRouting]}
          </p>
          <pre aria-label={t[RSC.TRY_RESULT_LABEL]} data-testid="augmented-context" className="whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-4 text-sm">
            {result.context}
          </pre>
        </>
      )}
    </section>
  );
}
