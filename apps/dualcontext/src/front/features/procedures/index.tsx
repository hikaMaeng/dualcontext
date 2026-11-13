import { useEffect, useState, type FormEvent } from "react";
import type { Procedure } from "dualcontext_domain/common";
import { Button } from "../../components/ui/button";
import { Checkbox, Input, Textarea } from "../../components/ui/input";
import { Field, ListDetail } from "../../components/layout";
import { api, splitList } from "../../lib/api";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { RSC } from "./resource";

type Form = { id: number | null; name: string; applies: string; steps: string; impacts: string; outputFormat: string; enabled: boolean };
const blank: Form = { id: null, name: "", applies: "", steps: "", impacts: "", outputFormat: "", enabled: true };

const toForm = (item: Procedure): Form => ({
  id: item.id, name: item.name, applies: item.appliesWhen.join(", "), steps: item.steps.join("\n"),
  impacts: item.impacts.join("\n"), outputFormat: item.outputFormat, enabled: item.enabled
});

export function ProceduresView({ t }: { t: Texts }) {
  const [items, setItems] = useState<Procedure[]>([]);
  const [form, setForm] = useState<Form>(blank);
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");

  const load = async () => {
    try {
      setItems(await api<Procedure[]>("/procedures"));
    } catch {
      setState("failed");
    }
  };
  useEffect(() => void load(), []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = {
      name: form.name, appliesWhen: splitList(form.applies, /,/), steps: splitList(form.steps, /\n/),
      impacts: splitList(form.impacts, /\n/), outputFormat: form.outputFormat, enabled: form.enabled
    };
    try {
      const saved = await api<Procedure>(form.id === null ? "/procedures" : `/procedures/${form.id}`, { method: form.id === null ? "POST" : "PUT", body });
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
      await api(`/procedures/${form.id}`, { method: "DELETE" });
      setForm(blank);
      setState("idle");
      await load();
    } catch {
      setState("failed");
    }
  };

  return (
    <section aria-labelledby="page-title" className="grid gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">{t[RSC.PROCEDURES_TITLE_TEXT]}</h1>
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
                <Button variant="ghost" size="sm" className="w-full" aria-current={form.id === item.id ? "page" : undefined} data-testid="procedure-item" onClick={() => setForm(toForm(item))}>
                  {item.name}
                </Button>
              </li>
            ))}
          </>
        }
        form={
          <form onSubmit={submit} className="grid gap-3" aria-labelledby="page-title">
            <Field label={t[SHARED.COMMON_NAME_LABEL]}><Input required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label={t[RSC.PROCEDURES_APPLIES_LABEL]}><Input value={form.applies} onChange={(e) => set("applies", e.target.value)} /></Field>
            <Field label={t[RSC.PROCEDURES_STEPS_LABEL]}><Textarea value={form.steps} onChange={(e) => set("steps", e.target.value)} /></Field>
            <Field label={t[RSC.PROCEDURES_IMPACTS_LABEL]}><Textarea value={form.impacts} onChange={(e) => set("impacts", e.target.value)} /></Field>
            <Field label={t[RSC.PROCEDURES_FORMAT_LABEL]}><Input value={form.outputFormat} onChange={(e) => set("outputFormat", e.target.value)} /></Field>
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
