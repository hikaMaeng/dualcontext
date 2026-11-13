import { useEffect, useState, type FormEvent } from "react";
import type { Researcher } from "dualcontext_domain/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { api, splitList } from "../../lib/api";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { RSC } from "./resource";

export function ResearchersView({ t }: { t: Texts }) {
  const [items, setItems] = useState<Researcher[]>([]);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");

  const load = async () => {
    try {
      setItems(await api<Researcher[]>("/researchers"));
    } catch {
      setFailed(true);
    }
  };
  useEffect(() => void load(), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    api("/researchers", { method: "POST", body: { name, description, keywords: splitList(keywords, /,/) } })
      .then(() => {
        setName("");
        setDescription("");
        setKeywords("");
        setFailed(false);
        return load();
      })
      .catch(() => setFailed(true));
  };

  const remove = (id: number) => api(`/researchers/${id}`, { method: "DELETE" }).then(load).catch(() => setFailed(true));

  return (
    <section aria-labelledby="researchers-title" className="grid gap-4">
      <h2 id="researchers-title" className="text-xl font-semibold">
        {t[RSC.RESEARCHERS_TITLE_TEXT]}
      </h2>
      <form onSubmit={submit} className="grid gap-3" aria-labelledby="researchers-title">
        <label className="grid gap-1 text-sm">
          {t[SHARED.COMMON_NAME_LABEL]}
          <Input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          {t[SHARED.COMMON_DESCRIPTION_LABEL]}
          <Input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          {t[RSC.RESEARCHERS_KEYWORDS_LABEL]}
          <Input value={keywords} onChange={(event) => setKeywords(event.target.value)} />
        </label>
        <Button type="submit" className="justify-self-start">
          {t[SHARED.COMMON_SAVE_BUTTON]}
        </Button>
      </form>
      {failed && <p role="alert" className="text-sm text-red-700">{t[SHARED.COMMON_ERROR_ALERT]}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">{t[SHARED.COMMON_EMPTY_MESSAGE]}</p>
      ) : (
        <ul aria-labelledby="researchers-title" className="grid gap-2">
          {items.map((item) => (
            <li key={item.id} data-testid="researcher-item" className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 text-sm">
              <span>
                <strong>{item.name}</strong> {item.keywords.join(", ")}
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
