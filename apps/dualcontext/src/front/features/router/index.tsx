import { useEffect, useState, type FormEvent } from "react";
import type { RouterConfig } from "dualcontext_domain/common";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { PreviewPanel } from "./preview/index";
import { SplitEditor } from "./split/index";
import { StageEditor } from "./stage/index";
import { RSC } from "./resource";

type Defaults = { prompts: { researcher: string; procedure: string; split: string } };

/**
 * 라우터 설정: 질의 분해 → 1단계(조사원 선택) → 2단계(프로시저 선택). 단계(stage)마다 라우팅 단계들을 위에서 아래로 쌓아
 * 후보를 차례로 좁힌다(예: 임베딩으로 후보를 넓게 뽑고 LLM 이 최종 선택). 저장 전에 아래 미리보기로 효과를 볼 수 있다.
 */
export function RouterView({ t }: { t: Texts }) {
  const [config, setConfig] = useState<RouterConfig | null>(null);
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");

  useEffect(() => {
    Promise.all([api<RouterConfig>("/router"), api<Defaults>("/router/defaults")])
      .then(([loaded, loadedDefaults]) => {
        setConfig(loaded);
        setDefaults(loadedDefaults);
      })
      .catch(() => setState("failed"));
  }, []);

  if (!config || !defaults) return state === "failed" ? <p role="alert" className="text-danger">{t[SHARED.COMMON_ERROR_ALERT]}</p> : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setConfig(await api<RouterConfig>("/router", { method: "PUT", body: config }));
      setState("saved");
    } catch {
      setState("failed");
    }
  };

  return (
    <section aria-labelledby="page-title" className="grid gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">{t[RSC.ROUTER_TITLE_TEXT]}</h1>
      <p className="max-w-3xl text-sm text-muted">{t[RSC.ROUTER_HINT_MESSAGE]}</p>
      <form onSubmit={submit} className="grid gap-4" aria-labelledby="page-title">
        <SplitEditor config={config.split} t={t} onChange={(split) => setConfig({ ...config, split })} />
        <StageEditor stage="researcher" config={config.researcher} defaultPrompt={defaults.prompts.researcher} t={t} onChange={(researcher) => setConfig({ ...config, researcher })} />
        <StageEditor stage="procedure" config={config.procedure} defaultPrompt={defaults.prompts.procedure} t={t} onChange={(procedure) => setConfig({ ...config, procedure })} />
        <div className="flex items-center gap-3">
          <Button type="submit">{t[SHARED.COMMON_SAVE_BUTTON]}</Button>
          {state === "saved" && <p role="status" className="text-sm text-muted">{t[SHARED.COMMON_SAVED_STATUS]}</p>}
          {state === "failed" && <p role="alert" className="text-sm text-danger">{t[SHARED.COMMON_ERROR_ALERT]}</p>}
        </div>
      </form>
      <PreviewPanel config={config} t={t} />
    </section>
  );
}
