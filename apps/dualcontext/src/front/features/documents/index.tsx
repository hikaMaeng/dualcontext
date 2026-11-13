import { useEffect, useState, type FormEvent } from "react";
import type { Researcher } from "dualcontext_domain/common";
import { Button } from "../../components/ui/button";
import { Input, Select, Textarea } from "../../components/ui/input";
import { api } from "../../lib/api";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { RSC } from "./resource";

type DocumentRow = { id: number; researcherId: number; title: string; excerpt: string };

export function DocumentsView({ t }: { t: Texts }) {
  const [items, setItems] = useState<DocumentRow[]>([]);
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [failed, setFailed] = useState(false);
  const [researcherId, setResearcherId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const load = () =>
    Promise.all([api<DocumentRow[]>("/documents"), api<Researcher[]>("/researchers")])
      .then(([documents, owners]) => {
        setItems(documents);
        setResearchers(owners);
      })
      .catch(() => setFailed(true));
  useEffect(() => void load(), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    api("/documents", { method: "POST", body: { researcherId: Number(researcherId), title, body } })
      .then(() => {
        setTitle("");
        setBody("");
        setFailed(false);
        return load();
      })
      .catch(() => setFailed(true));
  };

  const remove = (id: number) => api(`/documents/${id}`, { method: "DELETE" }).then(load).catch(() => setFailed(true));

  return (
    <section aria-labelledby="documents-title" className="grid gap-4">
      <h2 id="documents-title" className="text-xl font-semibold">
        {t[RSC.DOCUMENTS_TITLE_TEXT]}
      </h2>
      <form onSubmit={submit} className="grid gap-3" aria-labelledby="documents-title">
        <label className="grid gap-1 text-sm">
          {t[SHARED.COMMON_RESEARCHER_LABEL]}
          <Select required value={researcherId} onChange={(event) => setResearcherId(event.target.value)}>
            <option value="" />
            {researchers.map((researcher) => (
              <option key={researcher.id} value={researcher.id}>
                {researcher.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm">
          {t[RSC.DOCUMENTS_DOCTITLE_LABEL]}
          <Input required value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          {t[RSC.DOCUMENTS_BODY_LABEL]}
          <Textarea required value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <Button type="submit" className="justify-self-start">
          {t[SHARED.COMMON_SAVE_BUTTON]}
        </Button>
      </form>
      {failed && <p role="alert" className="text-sm text-red-700">{t[SHARED.COMMON_ERROR_ALERT]}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">{t[SHARED.COMMON_EMPTY_MESSAGE]}</p>
      ) : (
        <ul aria-labelledby="documents-title" className="grid gap-2">
          {items.map((item) => (
            <li key={item.id} data-testid="document-item" className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 text-sm">
              <span>
                <strong>{item.title}</strong> {item.excerpt}
              </span>
              <Button variant="outline" size="sm" onClick={() => void remove(item.id)}>
                {t[SHARED.COMMON_DELETE_BUTTON]}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
