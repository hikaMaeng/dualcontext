import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox, Input } from "../../components/ui/input";
import { Field } from "../../components/layout";
import { api } from "../../lib/api";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { RSC } from "./resource";

type Kind = "embedding" | "chat";
type Endpoint = { baseUrl: string; model: string; hasApiKey: boolean };
type Server = Record<Kind, Endpoint>;
type Secrets = Record<Kind, { apiKey: string; clearApiKey: boolean }>;

const noSecrets: Secrets = { embedding: { apiKey: "", clearApiKey: false }, chat: { apiKey: "", clearApiKey: false } };

export function AiServerView({ t }: { t: Texts }) {
  const [server, setServer] = useState<Server | null>(null);
  const [secrets, setSecrets] = useState<Secrets>(noSecrets);
  const [models, setModels] = useState<Record<Kind, string[]>>({ embedding: [], chat: [] });
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");

  useEffect(() => {
    api<Server>("/ai-server").then(setServer).catch(() => setState("failed"));
  }, []);

  if (!server) return state === "failed" ? <p role="alert" className="text-danger">{t[SHARED.COMMON_ERROR_ALERT]}</p> : null;

  const edit = (kind: Kind, field: "baseUrl" | "model", value: string) => setServer({ ...server, [kind]: { ...server[kind], [field]: value } });
  const editSecret = (kind: Kind, patch: Partial<Secrets[Kind]>) => setSecrets({ ...secrets, [kind]: { ...secrets[kind], ...patch } });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const part = (kind: Kind) => ({ baseUrl: server[kind].baseUrl, model: server[kind].model, ...secrets[kind] });
    try {
      setServer(await api<Server>("/ai-server", { method: "PUT", body: { embedding: part("embedding"), chat: part("chat") } }));
      setSecrets(noSecrets);
      setState("saved");
    } catch {
      setState("failed");
    }
  };

  // 저장하지 않은 주소로는 불러올 수 없으므로 먼저 저장한 값을 쓴다(서버가 저장된 설정으로 호출한다).
  const loadModels = async (kind: Kind) => {
    try {
      setModels({ ...models, [kind]: (await api<{ models: string[] }>(`/ai-server/models?kind=${kind}`)).models });
      setState("idle");
    } catch {
      setState("failed");
    }
  };

  const sections: { kind: Kind; heading: string }[] = [
    { kind: "embedding", heading: t[RSC.AISERVER_EMBEDDING_HEADING_TEXT] },
    { kind: "chat", heading: t[RSC.AISERVER_CHAT_HEADING_TEXT] }
  ];

  return (
    <section aria-labelledby="page-title" className="grid gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">{t[RSC.AISERVER_TITLE_TEXT]}</h1>
      <p className="max-w-3xl text-sm text-muted">{t[RSC.AISERVER_HINT_MESSAGE]}</p>
      <form onSubmit={submit} className="grid gap-4" aria-labelledby="page-title">
        {sections.map(({ kind, heading }) => (
          <Card key={kind} role="group" aria-labelledby={`${kind}-heading`}>
            <CardHeader><CardTitle id={`${kind}-heading`}>{heading}</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <Field label={t[RSC.AISERVER_URL_LABEL]}>
                <Input data-testid={`${kind}-url`} value={server[kind].baseUrl} onChange={(e) => edit(kind, "baseUrl", e.target.value)} />
              </Field>
              <Field label={t[RSC.AISERVER_MODEL_LABEL]}>
                <Input data-testid={`${kind}-model`} list={`${kind}-models`} value={server[kind].model} onChange={(e) => edit(kind, "model", e.target.value)} />
              </Field>
              <datalist id={`${kind}-models`}>
                {models[kind].map((id) => <option key={id} value={id} />)}
              </datalist>
              <Field label={t[RSC.AISERVER_KEY_LABEL]}>
                <Input type="password" autoComplete="off" value={secrets[kind].apiKey} onChange={(e) => editSecret(kind, { apiKey: e.target.value })} />
              </Field>
              {server[kind].hasApiKey && (
                <div className="flex items-center gap-4 text-sm">
                  <p role="status" className="text-muted">{t[RSC.AISERVER_KEYSET_STATUS]}</p>
                  <label className="flex items-center gap-2"><Checkbox checked={secrets[kind].clearApiKey} onChange={(e) => editSecret(kind, { clearApiKey: e.target.checked })} />{t[RSC.AISERVER_KEYCLEAR_LABEL]}</label>
                </div>
              )}
              <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => void loadModels(kind)}>{t[RSC.AISERVER_MODELS_BUTTON]}</Button>
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
