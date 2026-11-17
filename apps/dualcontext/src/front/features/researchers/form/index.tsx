import { useState, type FormEvent } from "react";
import type { Procedure, Researcher, ResearcherType } from "dualcontext_domain/common";
import { Button } from "../../../components/ui/button";
import { Checkbox, Input, Select } from "../../../components/ui/input";
import { Field } from "../../../components/layout";
import { api } from "../../../lib/api";
import type { Texts } from "../../../i18n";
import { RSC as SHARED } from "../../../resource";
import { StageEditor } from "../../router/stage/index";
import { CrawlerFields } from "../crawler/index";
import { RSC } from "../resource";
import { blank, toBody, toForm, type Form } from "./model";

type Props = {
  /** 고친 조사원. null 이면 새로 만든다. */
  item: Researcher | null;
  procedures: Procedure[];
  /** 개별 라우터를 처음 켤 때 채울 LLM 단계의 기본 프롬프트(서버가 준다). */
  individualPrompt: string;
  /** 저장된 조사원을 알린다(목록을 다시 읽고, 새로 만든 것이면 그 뷰로 옮긴다). */
  onSaved: (saved: Researcher) => void;
  onDeleted: () => void;
  t: Texts;
};

/** 조사원 하나의 편집 폼. 조사원이 바뀌면 부모가 key 로 새로 만든다(입력 상태가 이어지지 않게). */
export function ResearcherForm({ item, procedures, individualPrompt, onSaved, onDeleted, t }: Props) {
  const [form, setForm] = useState<Form>(item ? toForm(item) : blank);
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  /** 연결을 바꾸면 기본 프로시저 선택지도 따라간다: 연결이 해제된 프로시저가 기본으로 남지 않게 한다. */
  const toggle = (id: number) =>
    setForm((current) => {
      const procedureIds = current.procedureIds.includes(id) ? current.procedureIds.filter((x) => x !== id) : [...current.procedureIds, id];
      return { ...current, procedureIds, defaultProcedureId: procedureIds.includes(Number(current.defaultProcedureId)) ? current.defaultProcedureId : "" };
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const saved = await api<Researcher>(form.id === null ? "/researchers" : `/researchers/${form.id}`, { method: form.id === null ? "POST" : "PUT", body: toBody(form) });
      setForm(toForm(saved));
      setState("saved");
      onSaved(saved);
    } catch {
      setState("failed");
    }
  };

  const remove = async () => {
    if (form.id === null) return;
    try {
      await api(`/researchers/${form.id}`, { method: "DELETE" });
      onDeleted();
    } catch {
      setState("failed");
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3" aria-labelledby="researcher-heading">
      <Field label={t[SHARED.COMMON_NAME_LABEL]}><Input required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label={t[SHARED.COMMON_DESCRIPTION_LABEL]}><Input value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <Field label={t[RSC.RESEARCHERS_KEYWORDS_LABEL]}><Input value={form.keywords} onChange={(e) => set("keywords", e.target.value)} /></Field>
      <Field label={t[RSC.RESEARCHERS_TYPE_LABEL]}>
        <Select value={form.type} onChange={(e) => set("type", e.target.value as ResearcherType)}>
          <option value="pgvector">{t[RSC.RESEARCHERS_TYPE_PGVECTOR_TEXT]}</option>
          <option value="duckduckgo">{t[RSC.RESEARCHERS_TYPE_DUCKDUCKGO_TEXT]}</option>
          <option value="folder">{t[RSC.RESEARCHERS_TYPE_FOLDER_TEXT]}</option>
          <option value="codebase">{t[RSC.RESEARCHERS_TYPE_CODEBASE_TEXT]}</option>
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
      {form.type === "codebase" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t[RSC.RESEARCHERS_CODEBASE_SOURCE_LABEL]}>
            <Select value={form.cbSource} onChange={(e) => set("cbSource", e.target.value as Form["cbSource"])}>
              <option value="git">{t[RSC.RESEARCHERS_CODEBASE_SOURCE_GIT_TEXT]}</option>
              <option value="directory">{t[RSC.RESEARCHERS_CODEBASE_SOURCE_DIRECTORY_TEXT]}</option>
            </Select>
          </Field>
          <Field label={t[RSC.RESEARCHERS_CODEBASE_REFRESH_LABEL]}><Input type="number" min={0} max={720} value={form.cbRefresh} onChange={(e) => set("cbRefresh", e.target.value)} /></Field>
          {form.cbSource === "git" ? (
            <>
              <Field label={t[RSC.RESEARCHERS_CODEBASE_URL_LABEL]}><Input required value={form.cbUrl} onChange={(e) => set("cbUrl", e.target.value)} /></Field>
              <Field label={t[RSC.RESEARCHERS_CODEBASE_REF_LABEL]}><Input value={form.cbRef} onChange={(e) => set("cbRef", e.target.value)} /></Field>
              <Field label={t[RSC.RESEARCHERS_CODEBASE_SUBPATH_LABEL]}><Input value={form.cbSubPath} onChange={(e) => set("cbSubPath", e.target.value)} /></Field>
              <Field label={t[RSC.RESEARCHERS_CODEBASE_TOKENENV_LABEL]}><Input value={form.cbTokenEnv} onChange={(e) => set("cbTokenEnv", e.target.value)} /></Field>
            </>
          ) : (
            <>
              <Field label={t[RSC.RESEARCHERS_FOLDER_PATH_LABEL]}><Input required value={form.path} onChange={(e) => set("path", e.target.value)} /></Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox checked={form.cbProjects} onChange={(e) => set("cbProjects", e.target.checked)} />
                {t[RSC.RESEARCHERS_CODEBASE_PROJECTS_LABEL]}
              </label>
            </>
          )}
          <p className="max-w-3xl text-sm text-muted sm:col-span-2">{t[RSC.RESEARCHERS_CODEBASE_HINT_MESSAGE]}</p>
        </div>
      )}
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
      <Field label={t[RSC.RESEARCHERS_DEFAULT_PROCEDURE_LABEL]}>
        <Select data-testid="researcher-default-procedure-select" value={form.defaultProcedureId} onChange={(e) => set("defaultProcedureId", e.target.value)}>
          <option value="">{t[RSC.RESEARCHERS_DEFAULT_PROCEDURE_NONE_TEXT]}</option>
          {procedures.filter((procedure) => form.procedureIds.includes(procedure.id)).map((procedure) => (
            <option key={procedure.id} value={String(procedure.id)}>{procedure.name}</option>
          ))}
        </Select>
      </Field>
      <p className="max-w-3xl text-sm text-muted">{t[RSC.RESEARCHERS_DEFAULT_PROCEDURE_HINT_MESSAGE]}</p>
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
  );
}
