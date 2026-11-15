import { useEffect, useState, type FormEvent } from "react";
import type { Procedure, Researcher, ResearcherType, StageConfig } from "dualcontext_domain/common";
import { Button } from "../../components/ui/button";
import { Checkbox, Input, Select } from "../../components/ui/input";
import { Field, ListDetail } from "../../components/layout";
import { api, splitList } from "../../lib/api";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { StageEditor } from "../router/stage/index";
import { blankCrawler, CrawlerFields, toCrawlerConfig, toCrawlerForm, type CrawlerForm } from "./crawler/index";
import { RSC } from "./resource";

type Form = {
  id: number | null;
  name: string;
  description: string;
  keywords: string;
  enabled: boolean;
  type: ResearcherType;
  procedureIds: number[];
  topK: string;
  table: string;
  vectorColumn: string;
  reducedColumn: string;
  reducedDim: string;
  textColumn: string;
  titleColumn: string;
  path: string;
  crawler: CrawlerForm;
  /** 개별 라우터. null 이면 전역 라우터가 고른다. */
  router: StageConfig | null;
};

const blank: Form = {
  id: null, name: "", description: "", keywords: "", enabled: true, type: "pgvector", procedureIds: [], topK: "3",
  table: "", vectorColumn: "embedding", reducedColumn: "", reducedDim: "", textColumn: "body", titleColumn: "title", path: "", crawler: blankCrawler, router: null
};

function toForm(item: Researcher): Form {
  const c = item.config as Record<string, string | number | undefined>;
  return {
    id: item.id, name: item.name, description: item.description, keywords: item.keywords.join(", "), enabled: item.enabled,
    type: item.type, procedureIds: item.procedureIds, topK: String(c.topK ?? 3),
    table: String(c.table ?? ""), vectorColumn: String(c.vectorColumn ?? ""), reducedColumn: String(c.reducedColumn ?? ""),
    reducedDim: String(c.reducedDim ?? ""), textColumn: String(c.textColumn ?? ""), titleColumn: String(c.titleColumn ?? ""), path: String(c.path ?? ""), crawler: toCrawlerForm(item.config), router: item.router ?? null
  };
}

function toBody(form: Form) {
  const config =
    form.type === "duckduckgo"
      ? { topK: Number(form.topK) }
      : form.type === "folder"
        ? { path: form.path, topK: Number(form.topK) }
        : form.type === "crawler"
        ? toCrawlerConfig(form.crawler, Number(form.topK))
        : {
            table: form.table, vectorColumn: form.vectorColumn, textColumn: form.textColumn, topK: Number(form.topK),
            ...(form.titleColumn ? { titleColumn: form.titleColumn } : {}),
            ...(form.reducedColumn ? { reducedColumn: form.reducedColumn, reducedDim: Number(form.reducedDim) } : {})
          };
  return {
    name: form.name, description: form.description, keywords: splitList(form.keywords, /,/), enabled: form.enabled,
    type: form.type, config, procedureIds: form.procedureIds, router: form.router
  };
}

export function ResearchersView({ t }: { t: Texts }) {
  const [items, setItems] = useState<Researcher[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [form, setForm] = useState<Form>(blank);
  /** 개별 라우터를 처음 켤 때 채울 LLM 단계의 기본 프롬프트(서버가 준다). */
  const [individualPrompt, setIndividualPrompt] = useState("");
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");

  const load = async () => {
    try {
      const [researchers, linked] = await Promise.all([api<Researcher[]>("/researchers"), api<Procedure[]>("/procedures")]);
      setItems(researchers);
      setProcedures(linked);
      setIndividualPrompt((await api<{ prompts: { individual: string } }>("/router/defaults")).prompts.individual);
    } catch {
      setState("failed");
    }
  };
  useEffect(() => void load(), []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggle = (id: number) => set("procedureIds", form.procedureIds.includes(id) ? form.procedureIds.filter((x) => x !== id) : [...form.procedureIds, id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const saved = await api<Researcher>(form.id === null ? "/researchers" : `/researchers/${form.id}`, { method: form.id === null ? "POST" : "PUT", body: toBody(form) });
      setForm(toForm(saved));
      setState("saved");
      await load();
    } catch {
      setState("failed");
    }
  };

  const remove = async () => {
    if (form.id === null) return;
    try {
      await api(`/researchers/${form.id}`, { method: "DELETE" });
      setForm(blank);
      setState("idle");
      await load();
    } catch {
      setState("failed");
    }
  };

  return (
    <section aria-labelledby="page-title" className="grid gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">{t[RSC.RESEARCHERS_TITLE_TEXT]}</h1>
      <ListDetail
        listLabel={t[SHARED.COMMON_LIST_LABEL]}
        list={
          <>
            <li>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setForm(blank)}>{t[SHARED.COMMON_NEW_BUTTON]}</Button>
            </li>
            {items.length === 0 && <li className="text-sm text-muted">{t[SHARED.COMMON_EMPTY_MESSAGE]}</li>}
            {items.map((item) => (
              <li key={item.id}>
                <Button variant="ghost" size="sm" className="w-full" aria-current={form.id === item.id ? "page" : undefined} data-testid="researcher-item" onClick={() => setForm(toForm(item))}>
                  {item.name}
                </Button>
              </li>
            ))}
          </>
        }
        form={
          <form onSubmit={submit} className="grid gap-3" aria-labelledby="page-title">
            <Field label={t[SHARED.COMMON_NAME_LABEL]}><Input required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label={t[SHARED.COMMON_DESCRIPTION_LABEL]}><Input value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
            <Field label={t[RSC.RESEARCHERS_KEYWORDS_LABEL]}><Input value={form.keywords} onChange={(e) => set("keywords", e.target.value)} /></Field>
            <Field label={t[RSC.RESEARCHERS_TYPE_LABEL]}>
              <Select value={form.type} onChange={(e) => set("type", e.target.value as ResearcherType)}>
                <option value="pgvector">{t[RSC.RESEARCHERS_TYPE_PGVECTOR_TEXT]}</option>
                <option value="duckduckgo">{t[RSC.RESEARCHERS_TYPE_DUCKDUCKGO_TEXT]}</option>
                <option value="folder">{t[RSC.RESEARCHERS_TYPE_FOLDER_TEXT]}</option>
                <option value="crawler">{t[RSC.RESEARCHERS_TYPE_CRAWLER_TEXT]}</option>
              </Select>
            </Field>
            {form.type === "pgvector" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t[RSC.RESEARCHERS_PG_TABLE_LABEL]}><Input value={form.table} onChange={(e) => set("table", e.target.value)} /></Field>
                <Field label={t[RSC.RESEARCHERS_PG_VECTOR_LABEL]}><Input value={form.vectorColumn} onChange={(e) => set("vectorColumn", e.target.value)} /></Field>
                <Field label={t[RSC.RESEARCHERS_PG_REDUCED_LABEL]}><Input value={form.reducedColumn} onChange={(e) => set("reducedColumn", e.target.value)} /></Field>
                <Field label={t[RSC.RESEARCHERS_PG_REDUCEDDIM_LABEL]}><Input type="number" value={form.reducedDim} onChange={(e) => set("reducedDim", e.target.value)} /></Field>
                <Field label={t[RSC.RESEARCHERS_PG_TEXT_LABEL]}><Input value={form.textColumn} onChange={(e) => set("textColumn", e.target.value)} /></Field>
                <Field label={t[RSC.RESEARCHERS_PG_TITLE_LABEL]}><Input value={form.titleColumn} onChange={(e) => set("titleColumn", e.target.value)} /></Field>
              </div>
            )}
            {form.type === "folder" && <Field label={t[RSC.RESEARCHERS_FOLDER_PATH_LABEL]}><Input value={form.path} onChange={(e) => set("path", e.target.value)} /></Field>}
            {form.type === "crawler" && <CrawlerFields value={form.crawler} onChange={(next) => set("crawler", next)} id={form.id} t={t} />}
            <Field label={t[SHARED.COMMON_TOPK_LABEL]}><Input type="number" min={1} max={20} value={form.topK} onChange={(e) => set("topK", e.target.value)} /></Field>
            <fieldset className="grid gap-2 rounded-md border border-line p-3">
              <legend className="px-1 text-sm text-muted">{t[RSC.RESEARCHERS_PROCEDURES_LABEL]}</legend>
              {procedures.map((procedure) => (
                <label key={procedure.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.procedureIds.includes(procedure.id)} onChange={() => toggle(procedure.id)} />
                  {procedure.name}
                </label>
              ))}
            </fieldset>
            <fieldset className="grid gap-3 rounded-md border border-line p-3">
              <legend className="px-1 text-sm text-muted">{t[RSC.RESEARCHERS_ROUTER_LEGEND_LABEL]}</legend>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  data-testid="researcher-individual-router"
                  checked={form.router !== null}
                  onChange={(e) => set("router", e.target.checked ? { steps: [{ type: "llm", topK: 1, prompt: individualPrompt, showScores: false, allowNone: true, parts: false, onError: "skip" }] } : null)}
                />
                {t[RSC.RESEARCHERS_ROUTER_INDIVIDUAL_LABEL]}
              </label>
              <p className="max-w-3xl text-sm text-muted">{t[RSC.RESEARCHERS_ROUTER_HINT_MESSAGE]}</p>
              {form.router !== null && <StageEditor stage="individual" config={form.router} defaultPrompt={individualPrompt} t={t} onChange={(router) => set("router", router)} />}
            </fieldset>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />{t[SHARED.COMMON_ENABLED_LABEL]}</label>
            <div className="flex items-center gap-3">
              <Button type="submit">{t[SHARED.COMMON_SAVE_BUTTON]}</Button>
              {form.id !== null && <Button type="button" variant="outline" className="text-danger" onClick={() => void remove()}>{t[SHARED.COMMON_DELETE_BUTTON]}</Button>}
              {state === "saved" && <p role="status" className="text-sm text-muted">{t[SHARED.COMMON_SAVED_STATUS]}</p>}
              {state === "failed" && <p role="alert" className="text-sm text-danger">{t[SHARED.COMMON_ERROR_ALERT]}</p>}
            </div>
          </form>
        }
      />
    </section>
  );
}
