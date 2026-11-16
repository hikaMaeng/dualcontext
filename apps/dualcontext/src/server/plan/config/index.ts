import type pg from "pg";
import type { ContextMode, ContextPlanConfig } from "dualcontext_domain/common";
import { defaultPlanPrompts } from "../prompts/index.js";
import { legacyPlanPrompts } from "../prompts/legacy/index.js";
import { planConfigSchema, type PlanOverride } from "./schema.js";

export { contextModeSchema, planConfigSchema, planOverrideSchema, type PlanOverride } from "./schema.js";

/**
 * 기본 설정. 모드는 classic: 계획 모드는 질의 하나에 모델 호출이 수 배로 늘고 효과가 아직 측정되지 않았으므로,
 * 기존 동작을 그대로 두는 것이 기본이다(관리자가 켠다). 나머지 값은 계획 모드를 켰을 때의 출발점이다.
 */
export function defaultPlanConfig(): ContextPlanConfig {
  return {
    mode: "classic",
    maxLevels: 3,
    maxNeedsPerItem: 4,
    maxItems: 16,
    // 사전 컨텍스트 하나당 반영 글자 수. run 235 에서 깊은 의존성이 최종 컨텍스트를 35만 자로 부풀렸다(plan/provided).
    maxProvidedChars: 3000,
    dedupe: "llm",
    reevaluate: { maxRounds: 2, passScore: 80, maxMissing: 0, maxNewItems: 4 },
    prompts: { ...defaultPlanPrompts }
  };
}

/**
 * 저장된 값을 기본값 위에 얹는다(한 단계 깊이). 나중에 필드가 늘어도 옛 행이 읽히게 하려는 것이다(예: maxProvidedChars 가 없는 행은 3000).
 * 객체가 아닌 값(손상)은 기본값으로 본다. 범위 검증은 호출하는 쪽의 스키마가 한다.
 */
function overlay(stored: unknown): unknown {
  const base = defaultPlanConfig();
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return base;
  const record = stored as Record<string, unknown>;
  const nested = (key: "reevaluate" | "prompts") => {
    const value = record[key];
    return value && typeof value === "object" && !Array.isArray(value) ? { ...base[key], ...value } : base[key];
  };
  return { ...base, ...record, reevaluate: nested("reevaluate"), prompts: nested("prompts") };
}

type PromptKey = keyof ContextPlanConfig["prompts"];

/**
 * 저장된 프롬프트 중 **이전 기본값과 글자까지 같은 것**(관리자가 고치지 않은 것)만 현재 기본값으로 바꾼다.
 * 기본 프롬프트를 고쳐도 첫 시작 때 저장된 행에는 옛 문장이 남아 배포만으로는 반영되지 않기 때문이다. 바꾼 키 목록을 돌려준다.
 */
export function upgradeLegacyPrompts(stored: unknown): { config: unknown; upgraded: PromptKey[] } {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { config: stored, upgraded: [] };
  const record = stored as Record<string, unknown>;
  const prompts = record.prompts;
  if (!prompts || typeof prompts !== "object" || Array.isArray(prompts)) return { config: stored, upgraded: [] };
  const next = { ...(prompts as Record<string, unknown>) };
  const upgraded: PromptKey[] = [];
  for (const key of ["analyze", "prerequisites", "dedupe", "evaluate"] as const) {
    const value = next[key];
    if (typeof value !== "string" || value.trim() === defaultPlanPrompts[key].trim()) continue;
    if (legacyPlanPrompts.some((legacy) => legacy[key].trim() === value.trim())) {
      next[key] = defaultPlanPrompts[key];
      upgraded.push(key);
    }
  }
  return { config: upgraded.length > 0 ? { ...record, prompts: next } : stored, upgraded };
}

/**
 * 단일 행(id=1)을 기본값으로 만든다. 이미 있으면 관리자가 고친 값은 덮어쓰지 않고, 옛 기본 프롬프트 그대로인 키만 새 기본값으로 바꾼다.
 */
export async function ensurePlanConfig(pool: pg.Pool) {
  await pool.query(`insert into plan_config (id, config) values (1, $1) on conflict (id) do nothing`, [JSON.stringify(defaultPlanConfig())]);
  const { rows } = await pool.query<{ config: unknown }>(`select config from plan_config where id = 1`);
  const { config, upgraded } = upgradeLegacyPrompts(rows[0]?.config);
  if (upgraded.length === 0) return;
  await pool.query(`update plan_config set config = $1, updated_at = now() where id = 1`, [JSON.stringify(config)]);
  console.error(`plan_config: upgraded default prompts ${upgraded.join(", ")}`);
}

/** 저장된 설정. 행이 없으면 기본값. 저장된 값이 범위를 벗어나면 던진다(라우터 설정과 같다: 조용히 다른 설정으로 돌지 않는다). */
export async function readPlanConfig(pool: pg.Pool): Promise<ContextPlanConfig> {
  const { rows } = await pool.query<{ config: unknown }>(`select config from plan_config where id = 1`);
  if (rows.length === 0) return defaultPlanConfig();
  return planConfigSchema.parse(overlay(rows[0].config)) as ContextPlanConfig;
}

export async function writePlanConfig(pool: pg.Pool, config: ContextPlanConfig) {
  await pool.query(`insert into plan_config (id, config) values (1, $1) on conflict (id) do update set config = excluded.config, updated_at = now()`, [JSON.stringify(config)]);
}

/** 실행 한 번에만 쓸 설정: 저장된 설정에 mode 와 숫자 한도 override 를 얹는다(저장 설정은 바꾸지 않는다). */
export function applyPlanOverride(config: ContextPlanConfig, mode?: ContextMode, override?: PlanOverride): ContextPlanConfig {
  const { reevaluate, ...limits } = override ?? {};
  const defined = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
  return {
    ...config,
    ...defined(limits),
    mode: mode ?? config.mode,
    reevaluate: { ...config.reevaluate, ...defined(reevaluate ?? {}) },
    prompts: { ...config.prompts }
  };
}
