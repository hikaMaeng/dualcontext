import type { ContextMode, ContextPlanConfig } from "dualcontext_domain/common";
import { CONTEXT_MODES } from "../../../../../../components/plan-labels";

/** 실행 로그 스냅샷(settings)에서 읽은 「어떤 실행계획으로 수행했나」. 값이 없는 필드는 없다고 둔다(옛 실행 · 계약 밖 값). */
export type ExecutionPlan = {
  mode: ContextMode;
  /** 한도 스냅샷이 있었는가. 없으면(옛 실행) 모드만 안다. */
  hasLimits: boolean;
  limits: Partial<Pick<ContextPlanConfig, "maxLevels" | "maxNeedsPerItem" | "maxItems" | "maxProvidedChars" | "dedupe">>;
  reevaluate: Partial<ContextPlanConfig["reevaluate"]>;
  writer: { name: string; mode: "batch" | "per_pair" | null } | null;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const pick = <T extends Record<string, number | undefined>>(source: Record<string, unknown>, keys: (keyof T)[]): T => {
  const out: Record<string, number> = {};
  for (const key of keys) {
    const value = num(source[key as string]);
    if (value !== undefined) out[key as string] = value;
  }
  return out as T;
};

/**
 * 실행 상세의 settings(unknown)와 plan 기록의 모드에서 실행계획을 읽는다.
 * 모드 우선순위: settings.plan.mode → plan 기록의 mode → classic(기본). 한도는 settings.plan 에서만 읽고, 모드가 쓰지 않는 값은 호출자가 고른다.
 * 어떤 모양이 와도 던지지 않는다.
 */
export function readExecutionPlan(settings: unknown, tracedMode?: string | null): ExecutionPlan {
  const root = isObject(settings) ? settings : {};
  const plan = isObject(root.plan) ? root.plan : null;
  const candidate = plan?.mode ?? tracedMode;
  const mode = (CONTEXT_MODES as unknown[]).includes(candidate) ? (candidate as ContextMode) : "classic";
  const writer = isObject(root.writer) && typeof root.writer.name === "string" ? root.writer : null;
  const reevaluate = plan && isObject(plan.reevaluate) ? plan.reevaluate : {};
  return {
    mode,
    hasLimits: plan !== null,
    limits: {
      ...(plan ? pick<{ maxLevels?: number; maxNeedsPerItem?: number; maxItems?: number; maxProvidedChars?: number }>(plan, ["maxLevels", "maxNeedsPerItem", "maxItems", "maxProvidedChars"]) : {}),
      ...(plan && (plan.dedupe === "name" || plan.dedupe === "llm") ? { dedupe: plan.dedupe } : {})
    },
    reevaluate: pick<Partial<ContextPlanConfig["reevaluate"]>>(reevaluate, ["maxRounds", "passScore", "maxMissing", "maxNewItems"]),
    writer: writer
      ? { name: writer.name as string, mode: writer.mode === "batch" || writer.mode === "per_pair" ? writer.mode : null }
      : null
  };
}
