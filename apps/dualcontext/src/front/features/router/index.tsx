import { useEffect, useState, type FormEvent } from "react";
import type { RouterConfig, RoutingMethod } from "dualcontext_domain/common";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input, Select, Textarea } from "../../components/ui/input";
import { Field } from "../../components/layout";
import { api } from "../../lib/api";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { RSC } from "./resource";

type Stage = "researcher" | "procedure";

export function RouterView({ t }: { t: Texts }) {
  const [config, setConfig] = useState<RouterConfig | null>(null);
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");

  useEffect(() => {
    api<RouterConfig>("/router").then(setConfig).catch(() => setState("failed"));
  }, []);

  if (!config) return state === "failed" ? <p role="alert" className="text-danger">{t[SHARED.COMMON_ERROR_ALERT]}</p> : null;

  const update = (stage: Stage, field: "Method" | "TopK" | "Prompt", value: string | number) =>
    setConfig({ ...config, [`${stage}${field}`]: value } as RouterConfig);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setConfig(await api<RouterConfig>("/router", { method: "PUT", body: config }));
      setState("saved");
    } catch {
      setState("failed");
    }
  };

  const stages: { stage: Stage; heading: string; method: RoutingMethod; topK: number; prompt: string }[] = [
    { stage: "researcher", heading: t[RSC.ROUTER_RESEARCHER_HEADING_TEXT], method: config.researcherMethod, topK: config.researcherTopK, prompt: config.researcherPrompt },
    { stage: "procedure", heading: t[RSC.ROUTER_PROCEDURE_HEADING_TEXT], method: config.procedureMethod, topK: config.procedureTopK, prompt: config.procedurePrompt }
  ];

  return (
    <section aria-labelledby="page-title" className="grid gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">{t[RSC.ROUTER_TITLE_TEXT]}</h1>
      <p className="max-w-3xl text-sm text-muted">{t[RSC.ROUTER_HINT_MESSAGE]}</p>
      <form onSubmit={submit} className="grid gap-4" aria-labelledby="page-title">
        {stages.map((entry) => (
          <Card key={entry.stage} role="group" aria-labelledby={`${entry.stage}-heading`}>
            <CardHeader><CardTitle id={`${entry.stage}-heading`}>{entry.heading}</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t[RSC.ROUTER_METHOD_LABEL]}>
                  <Select data-testid={`${entry.stage}-method`} value={entry.method} onChange={(e) => update(entry.stage, "Method", e.target.value)}>
                    <option value="embedding">{t[RSC.ROUTER_METHOD_EMBEDDING_TEXT]}</option>
                    <option value="llm">{t[RSC.ROUTER_METHOD_LLM_TEXT]}</option>
                    <option value="keyword">{t[RSC.ROUTER_METHOD_KEYWORD_TEXT]}</option>
                  </Select>
                </Field>
                <Field label={t[SHARED.COMMON_TOPK_LABEL]}>
                  <Input type="number" min={1} max={20} value={entry.topK} onChange={(e) => update(entry.stage, "TopK", Number(e.target.value))} />
                </Field>
              </div>
              <Field label={t[RSC.ROUTER_PROMPT_LABEL]}>
                <Textarea className="min-h-40" value={entry.prompt} onChange={(e) => update(entry.stage, "Prompt", e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        ))}
        <div className="flex items-center gap-3">
          <Button type="submit">{t[SHARED.COMMON_SAVE_BUTTON]}</Button>
          {state === "saved" && <p role="status" className="text-sm text-muted">{t[SHARED.COMMON_SAVED_STATUS]}</p>}
          {state === "failed" && <p role="alert" className="text-sm text-danger">{t[SHARED.COMMON_ERROR_ALERT]}</p>}
        </div>
      </form>
    </section>
  );
}
