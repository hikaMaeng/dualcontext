import type { ContextPlanConfig } from "dualcontext_domain/common";
import { api } from "../../../lib/api";

export type PlanPrompts = ContextPlanConfig["prompts"];
export type PromptKey = keyof PlanPrompts;
/** GET /plan/defaults: 기본 설정과 단계별 기본 프롬프트. */
export type PlanDefaults = { config: ContextPlanConfig; prompts: PlanPrompts };

export const PROMPT_KEYS: PromptKey[] = ["analyze", "prerequisites", "dedupe", "evaluate"];

export const loadPlanConfig = () => api<ContextPlanConfig>("/plan/config");
export const loadPlanDefaults = () => api<PlanDefaults>("/plan/defaults");
export const savePlanConfig = (config: ContextPlanConfig) => api<ContextPlanConfig>("/plan/config", { method: "PUT", body: config });

/** maxProvidedChars 의 계약 기본값. /plan/defaults 가 그 값을 주지 않을 때만 쓴다. */
export const DEFAULT_MAX_PROVIDED_CHARS = 3000;

/**
 * 서버가 준 설정에 빠진 필드를 기본 설정으로 채운다. 이 필드가 생기기 전에 저장된 설정(옛 행)에는 maxProvidedChars 가 없을 수 있다.
 * 숫자가 아니면 defaults.config 의 값, 그것도 없으면 계약 기본값(3000)으로 보인다. 채운 값은 저장 버튼을 누르면 함께 저장된다.
 */
export function withPlanDefaults(config: ContextPlanConfig, defaults: Pick<PlanDefaults, "config"> | null): ContextPlanConfig {
  const fallback = defaults?.config?.maxProvidedChars;
  if (typeof config.maxProvidedChars === "number") return config;
  return { ...config, maxProvidedChars: typeof fallback === "number" ? fallback : DEFAULT_MAX_PROVIDED_CHARS };
}

/**
 * 저장 실패에서 서버 검증 메시지를 꺼낸다. `api()` 는 `"<status> <본문>"` 으로 던지므로 400 이고 본문이
 * `{ error: string }` 일 때만 그 문장을 돌려주고, 그 밖(네트워크 · 500 · 해석 불가)은 null 이다(화면은 일반 오류 문구를 보인다).
 */
export function validationMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const match = /^400 ([\s\S]*)$/.exec(error.message);
  if (!match) return null;
  try {
    const body = JSON.parse(match[1]) as { error?: unknown };
    return typeof body.error === "string" && body.error !== "" ? body.error : null;
  } catch {
    return null;
  }
}
