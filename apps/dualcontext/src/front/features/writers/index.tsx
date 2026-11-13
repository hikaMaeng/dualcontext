import { useEffect, useState, type FormEvent } from "react";
import type { WriterConfig, WriterEngine, WriterMode } from "dualcontext_domain/common";
import { Button } from "../../components/ui/button";
import { Input, Select, Textarea } from "../../components/ui/input";
import { Field, ListDetail } from "../../components/layout";
import { api } from "../../lib/api";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { RSC } from "./resource";

type Form = { id: number | null; name: string; engine: WriterEngine; mode: WriterMode; prompt: string; active: boolean };
const blank: Form = { id: null, name: "", engine: "llm", mode: "batch", prompt: "", active: false };

export function WritersView({ t }: { t: Texts }) {
  const [items, setItems] = useState<WriterConfig[]>([]);
  const [form, setForm] = useState<Form>(blank);
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");

  const load = async () => {
    try {
      setItems(await api<WriterConfig[]>("/writers"));
    } catch {
      setState("failed");
    }
  };
  useEffect(() => void load(), []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = { name: form.name, engine: form.engine, mode: form.mode, prompt: form.prompt };
    try {
      const saved = await api<WriterConfig>(form.id === null ? "/writers" : `/writers/${form.id}`, { method: form.id === null ? "POST" : "PUT", body });
      setForm(saved);
      setState("saved");
      await load();
    } catch {
      setState("failed");
    }
  };

  const activate = async () => {
    if (form.id === null) return;
    try {
      await api(`/writers/${form.id}/activate`, { method: "POST" });
      set("active", true);
      await load();
    } catch {
      setState("failed");
    }
  };

  const remove = async () => {
    if (form.id === null) return;
    try {
      await api(`/writers/${form.id}`, { method: "DELETE" });
      setForm(blank);
      await load();
    } catch {
      setState("failed");
    }
  };

  return (
    <section aria-labelledby="page-title" className="grid gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">{t[RSC.WRITERS_TITLE_TEXT]}</h1>
      <p className="max-w-3xl text-sm text-muted">{t[RSC.WRITERS_HINT_MESSAGE]}</p>
      <ListDetail
        listLabel={t[SHARED.COMMON_LIST_LABEL]}
        list={
          <>
            <li>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setForm(blank)}>{t[SHARED.COMMON_NEW_BUTTON]}</Button>
            </li>
            {items.map((item) => (
              <li key={item.id}>
                <Button variant="ghost" size="sm" className="w-full" aria-current={form.id === item.id ? "page" : undefined} data-testid="writer-item" onClick={() => setForm(item)}>
                  {item.name}
                  {item.active && <span className="ml-auto text-xs text-accent">●</span>}
                </Button>
              </li>
            ))}
          </>
        }
        form={
          <form onSubmit={submit} className="grid gap-3" aria-labelledby="page-title">
            <Field label={t[SHARED.COMMON_NAME_LABEL]}><Input required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t[RSC.WRITERS_ENGINE_LABEL]}>
                <Select value={form.engine} onChange={(e) => set("engine", e.target.value as WriterEngine)}>
                  <option value="llm">{t[RSC.WRITERS_ENGINE_LLM_TEXT]}</option>
                  <option value="template">{t[RSC.WRITERS_ENGINE_TEMPLATE_TEXT]}</option>
                </Select>
              </Field>
              <Field label={t[RSC.WRITERS_MODE_LABEL]}>
                <Select value={form.mode} onChange={(e) => set("mode", e.target.value as WriterMode)}>
                  <option value="batch">{t[RSC.WRITERS_MODE_BATCH_TEXT]}</option>
                  <option value="per_pair">{t[RSC.WRITERS_MODE_PERPAIR_TEXT]}</option>
                </Select>
              </Field>
            </div>
            <Field label={t[RSC.WRITERS_PROMPT_LABEL]}><Textarea className="min-h-72" value={form.prompt} onChange={(e) => set("prompt", e.target.value)} /></Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">{t[SHARED.COMMON_SAVE_BUTTON]}</Button>
              {form.id !== null && !form.active && <Button type="button" variant="outline" onClick={() => void activate()}>{t[RSC.WRITERS_ACTIVATE_BUTTON]}</Button>}
              {form.id !== null && form.active && <p role="status" className="text-sm text-accent">{t[RSC.WRITERS_ACTIVE_STATUS]}</p>}
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
