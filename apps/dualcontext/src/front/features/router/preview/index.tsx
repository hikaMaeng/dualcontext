import { useState, type FormEvent } from "react";
import type { IndividualTrace, RouterConfig, StepTrace } from "dualcontext_domain/common";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Field } from "../../../components/layout";
import { api } from "../../../lib/api";
import type { Texts } from "../../../i18n";
import { RSC as SHARED } from "../../../resource";
import { RSC } from "./resource";

type Asked = { asked: string; mode: string; selected: string[]; steps: StepTrace[]; individual: IndividualTrace[] };
type Preview = {
  parts: string[];
  mode: string;
  selected: string[];
  asked: Asked[];
  scores: { name: string; score: number; selected: boolean }[];
  procedures: { researcher: string; mode: string; selected: string[]; steps: StepTrace[] }[];
  ms: number;
};

function Steps({ steps, t }: { steps: StepTrace[]; t: Texts }) {
  return (
    <ol aria-label={t[RSC.ROUTER_PREVIEW_STEPS_LABEL]} className="grid gap-0.5 text-sm text-muted">
      {steps.map((step, index) => (
        <li key={index} data-testid="preview-step" className="font-mono">
          {step.type} {step.input}→{step.output} · {(step.ms / 1000).toFixed(1)}{t[SHARED.COMMON_SECONDS_TEXT]}{step.note ? ` · ${step.note}` : ""}
        </li>
      ))}
    </ol>
  );
}

/**
 * 질의 하나로 라우팅만 돌려 본다. 저장하지 않은 현재 편집 중인 설정으로 돌리므로, 저장 전에 단계 구성의 효과를 볼 수 있다.
 * 자료 수집과 라이터는 부르지 않아 빠르다.
 */
export function PreviewPanel({ config, t }: { config: RouterConfig; t: Texts }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"idle" | "running" | "failed">("idle");
  const [result, setResult] = useState<Preview | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState("running");
    try {
      setResult(await api<Preview>("/router/preview", { method: "POST", body: { query, config } }));
      setState("idle");
    } catch {
      setState("failed");
    }
  };

  return (
    <Card role="group" aria-labelledby="preview-heading">
      <CardHeader><CardTitle id="preview-heading">{t[RSC.ROUTER_PREVIEW_HEADING_TEXT]}</CardTitle></CardHeader>
      <CardContent className="grid gap-3">
        <p className="max-w-3xl text-sm text-muted">{t[RSC.ROUTER_PREVIEW_HINT_MESSAGE]}</p>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Field label={t[RSC.ROUTER_PREVIEW_QUERY_LABEL]}>
              <Input data-testid="preview-query" value={query} onChange={(e) => setQuery(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" disabled={query.trim() === "" || state === "running"}>{t[RSC.ROUTER_PREVIEW_RUN_BUTTON]}</Button>
        </form>
        {state === "running" && <p role="status" className="text-sm text-muted">{t[RSC.ROUTER_PREVIEW_RUNNING_STATUS]}</p>}
        {state === "failed" && <p role="alert" className="text-sm text-danger">{t[RSC.ROUTER_PREVIEW_FAILED_ALERT]}</p>}
        {result && (
          <div data-testid="preview-result" className="grid gap-3">
            <p className="text-sm">
              <span className="font-semibold">{t[RSC.ROUTER_PREVIEW_SELECTED_LABEL]}</span>{" "}
              <span data-testid="preview-selected">{result.selected.length > 0 ? result.selected.join(", ") : t[RSC.ROUTER_PREVIEW_NONE_MESSAGE]}</span>
              <span className="text-muted"> · {result.mode} · {(result.ms / 1000).toFixed(1)}{t[SHARED.COMMON_SECONDS_TEXT]}</span>
            </p>
            {result.parts.length > 0 && (
              <ul aria-label={t[RSC.ROUTER_PREVIEW_PARTS_LABEL]} className="grid gap-0.5 text-sm text-muted">
                {result.parts.map((part) => <li key={part}>{part}</li>)}
              </ul>
            )}
            <ul className="grid gap-2">
              {result.asked.map((entry) => (
                <li key={entry.asked} className="grid gap-0.5 text-sm">
                  <span className="truncate">{entry.asked} → {entry.selected.length > 0 ? entry.selected.join(", ") : t[RSC.ROUTER_PREVIEW_NONE_MESSAGE]}</span>
                  <Steps steps={entry.steps} t={t} />
                  {entry.individual.length > 0 && (
                    <ul aria-label={t[RSC.ROUTER_PREVIEW_INDIVIDUAL_LABEL]} className="grid gap-0.5 text-sm text-muted">
                      {entry.individual.map((verdict) => (
                        <li key={verdict.researcher} data-testid="preview-individual" data-selected={verdict.selected}>
                          {verdict.researcher} · {verdict.selected ? t[RSC.ROUTER_PREVIEW_INDIVIDUAL_INCLUDED_TEXT] : t[RSC.ROUTER_PREVIEW_INDIVIDUAL_EXCLUDED_TEXT]} · {verdict.mode}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            {result.scores.length > 0 && (
              <ul aria-label={t[RSC.ROUTER_PREVIEW_SCORES_LABEL]} className="grid gap-0.5 text-sm">
                {result.scores.map((entry) => (
                  <li key={entry.name} data-selected={entry.selected} className={entry.selected ? "text-fg" : "text-muted"}>
                    <span className="inline-block w-14 font-mono">{entry.score.toFixed(3)}</span>{entry.name}
                  </li>
                ))}
              </ul>
            )}
            {result.procedures.length > 0 && (
              <ul aria-label={t[RSC.ROUTER_PREVIEW_PROCEDURES_LABEL]} className="grid gap-1 text-sm">
                {result.procedures.map((entry) => (
                  <li key={entry.researcher}>{entry.researcher} → {entry.selected.length > 0 ? entry.selected.join(", ") : t[RSC.ROUTER_PREVIEW_NONE_MESSAGE]} · {entry.mode}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
