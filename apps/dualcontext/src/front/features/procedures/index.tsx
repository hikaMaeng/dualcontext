import { useEffect, useState, type FormEvent } from "react";
import type { Procedure, Researcher } from "dualcontext_domain/common";
import { Button } from "../../components/ui/button";
import { Input, Select, Textarea } from "../../components/ui/input";
import { api, splitList } from "../../lib/api";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { RSC } from "./resource";

export function ProceduresView({ t }: { t: Texts }) {
  const [items, setItems] = useState<Procedure[]>([]);
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [failed, setFailed] = useState(false);
  const [researcherId, setResearcherId] = useState("");
  const [name, setName] = useState("");
  const [applies, setApplies] = useState("");
  const [steps, setSteps] = useState("");
  const [impacts, setImpacts] = useState("");
  const [outputFormat, setOutputFormat] = useState("");

  const load = () =>
    Promise.all([api<Procedure[]>("/procedures"), api<Researcher[]>("/researchers")])
      .then(([procedures, owners]) => {
        setItems(procedures);
        setResearchers(owners);
      })
      .catch(() => setFailed(true));
  useEffect(() => void load(), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    api("/procedures", {
      method: "POST",
      body: {
        researcherId: Number(researcherId),
        name,
        appliesWhen: splitList(applies, /,/),
        steps: splitList(steps, /\n/),
        impacts: splitList(impacts, /\n/),
        outputFormat
      }
    })
      .then(() => {
        setName("");
        setApplies("");
        setSteps("");
        setImpacts("");
        setOutputFormat("");
        setFailed(false);
        return load();
      })
      .catch(() => setFailed(true));
  };

  const remove = (id: number) => api(`/procedures/${id}`, { method: "DELETE" }).then(load).catch(() => setFailed(true));

  return (
    <section aria-labelledby="procedures-title" className="grid gap-4">
      <h2 id="procedures-title" className="text-xl font-semibold">
        {t[RSC.PROCEDURES_TITLE_TEXT]}
      </h2>
      <form onSubmit={submit} className="grid gap-3" aria-labelledby="procedures-title">
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
          {t[SHARED.COMMON_NAME_LABEL]}
          <Input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          {t[RSC.PROCEDURES_APPLIES_LABEL]}
          <Input value={applies} onChange={(event) => setApplies(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          {t[RSC.PROCEDURES_STEPS_LABEL]}
          <Textarea value={steps} onChange={(event) => setSteps(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          {t[RSC.PROCEDURES_IMPACTS_LABEL]}
          <Textarea value={impacts} onChange={(event) => setImpacts(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          {t[RSC.PROCEDURES_FORMAT_LABEL]}
          <Input value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)} />
        </label>
        <Button type="submit" className="justify-self-start">
          {t[SHARED.COMMON_SAVE_BUTTON]}
        </Button>
      </form>
      {failed && <p role="alert" className="text-sm text-red-700">{t[SHARED.COMMON_ERROR_ALERT]}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">{t[SHARED.COMMON_EMPTY_MESSAGE]}</p>
      ) : (
        <ul aria-labelledby="procedures-title" className="grid gap-2">
          {items.map((item) => (
            <li key={item.id} data-testid="procedure-item" className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 text-sm">
              <span>
                <strong>{item.name}</strong> {researchers.find((researcher) => researcher.id === item.researcherId)?.name}
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
