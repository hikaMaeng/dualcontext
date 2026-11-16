import { useEffect, useState, type FormEvent } from "react";
import type { ContextPlanConfig } from "dualcontext_domain/common";
import { Button } from "../../components/ui/button";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { loadPlanConfig, loadPlanDefaults, savePlanConfig, validationMessage, withPlanDefaults, type PlanDefaults } from "./api";
import { LimitsEditor } from "./limits";
import { ModeChoice } from "./mode";
import { PromptsEditor } from "./prompts";
import { ReevaluateEditor } from "./reevaluate";
import { RSC } from "./resource";

type SaveState = { kind: "idle" } | { kind: "saved" } | { kind: "failed"; message: string | null };

/**
 * 컨텍스트 계획기 설정: 모드(classic · decompose · reevaluate), 분해 한도, 재평가 한도, 단계별 프롬프트.
 * 저장은 PUT /plan/config 한 번이고, 서버 검증이 거부하면(400 {error}) 그 문장을 저장 버튼 옆에 보인다.
 * 설정 값은 이 화면만 읽는 서버 캐시라 다른 관리 화면(router · writers)처럼 화면의 로컬 상태로 둔다.
 */
export function PlanView({ t }: { t: Texts }) {
  const [config, setConfig] = useState<ContextPlanConfig | null>(null);
  const [defaults, setDefaults] = useState<PlanDefaults | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  useEffect(() => {
    Promise.all([loadPlanConfig(), loadPlanDefaults()])
      .then(([loaded, loadedDefaults]) => {
        setConfig(withPlanDefaults(loaded, loadedDefaults));
        setDefaults(loadedDefaults);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  if (!config || !defaults) {
    return loadFailed ? <p role="alert" data-testid="plan-load-error" className="text-danger">{t[SHARED.COMMON_ERROR_ALERT]}</p> : null;
  }

  const patch = (next: Partial<ContextPlanConfig>) => {
    setConfig({ ...config, ...next });
    setSave({ kind: "idle" });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setConfig(withPlanDefaults(await savePlanConfig(config), defaults));
      setSave({ kind: "saved" });
    } catch (error) {
      setSave({ kind: "failed", message: validationMessage(error) });
    }
  };

  return (
    <section aria-labelledby="page-title" className="grid gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">{t[RSC.PLAN_TITLE_TEXT]}</h1>
      <p className="max-w-3xl text-sm text-muted">{t[RSC.PLAN_HINT_MESSAGE]}</p>
      <form onSubmit={submit} className="grid gap-4" aria-labelledby="page-title" data-testid="plan-form">
        <ModeChoice mode={config.mode} t={t} onChange={(mode) => patch({ mode })} />
        <LimitsEditor config={config} t={t} onChange={patch} />
        <ReevaluateEditor
          config={config.reevaluate}
          active={config.mode === "reevaluate"}
          t={t}
          onChange={(next) => patch({ reevaluate: { ...config.reevaluate, ...next } })}
        />
        <PromptsEditor prompts={config.prompts} defaults={defaults.prompts} t={t} onChange={(key, value) => patch({ prompts: { ...config.prompts, [key]: value } })} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" data-testid="plan-save">{t[SHARED.COMMON_SAVE_BUTTON]}</Button>
          {save.kind === "saved" && <p role="status" data-testid="plan-saved" className="text-sm text-muted">{t[SHARED.COMMON_SAVED_STATUS]}</p>}
          {save.kind === "failed" && (
            <p role="alert" data-testid="plan-error" className="max-h-48 w-full overflow-auto whitespace-pre-wrap break-words text-sm text-danger">
              {save.message === null ? t[SHARED.COMMON_ERROR_ALERT] : `${t[RSC.PLAN_INVALID_ALERT]}: ${save.message}`}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
