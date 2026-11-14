import type pg from "pg";
import type { RouterConfig, RouterStep } from "dualcontext_domain/common";
import { defaultMaxParts, defaultMinPartChars } from "dualcontext_domain/server";
import { procedurePrompt, researcherPrompt, splitPrompt } from "./prompts.js";
import { routerConfigSchema } from "./schema.js";

export { routerConfigSchema } from "./schema.js";

/**
 * 기본 설정. 조사원은 임베딩으로 후보를 넓게(상위 6, 최소 0.6, 마진 없음) 뽑고 LLM 이 최종 선택하는 두 단계, 질의 분해 없음.
 * 프로시저는 임베딩 상위 1개. LLM 단계가 실패하면(onError skip) 넓은 후보가 그대로 남으므로 운영에서는 실패 기록(mode)을 본다.
 * 측정 근거: test/20261115/route-eval_report.md (B_hybrid: 재현율 0.98~1.0, 불필요 선택 0.03~0.2, 질의당 p50 약 4초).
 */
export function defaultRouterConfig(): RouterConfig {
  return {
    split: { method: "none", maxParts: defaultMaxParts, minChars: defaultMinPartChars, partTopK: 1, prompt: splitPrompt },
    researcher: { steps: [
      { type: "embedding", topK: 6, minScore: 0.6, margin: 1, parts: true, onError: "keyword" },
      { type: "llm", topK: 4, prompt: researcherPrompt, showScores: true, allowNone: true, parts: false, onError: "skip" }
    ] },
    procedure: { steps: [{ type: "embedding", topK: 1, minScore: 0, margin: 1, parts: true, onError: "keyword" }] }
  };
}

type Legacy = { method: string; topK: number; minScore: number; prompt: string };

/** 단계 설정이 생기기 전의 단일 방법 설정(method, topK, minScore, prompt)을 같은 동작의 한 단계로 옮긴다. */
function legacyStep(legacy: Legacy, margin: number): RouterStep {
  if (legacy.method === "llm") return { type: "llm", topK: legacy.topK, prompt: legacy.prompt, showScores: false, allowNone: true, parts: false, onError: "keyword" };
  if (legacy.method === "keyword") return { type: "keyword", topK: legacy.topK, parts: true, onError: "none" };
  return { type: "embedding", topK: legacy.topK, minScore: legacy.minScore, margin, parts: true, onError: "keyword" };
}

/** 저장된 설정이 없으면(단계 설정 이전 배포) 옛 열의 값에서 같은 동작의 설정을 만들어 채운다. 이미 있으면 건드리지 않는다. */
export async function ensureRouterConfig(pool: pg.Pool) {
  await pool.query(`insert into router_config (id) values (1) on conflict (id) do nothing`);
  const { rows } = await pool.query<{ pipeline: unknown; researcher_method: string | null; researcher_top_k: number | null; researcher_min_score: number | null; researcher_prompt: string | null; procedure_method: string | null; procedure_top_k: number | null; procedure_min_score: number | null; procedure_prompt: string | null }>(
    `select pipeline, researcher_method, researcher_top_k, researcher_min_score, researcher_prompt, procedure_method, procedure_top_k, procedure_min_score, procedure_prompt from router_config where id = 1`
  );
  const row = rows[0];
  if (row.pipeline !== null) return;
  const config = defaultRouterConfig();
  if (row.researcher_method !== null) {
    config.researcher = { steps: [legacyStep({ method: row.researcher_method, topK: row.researcher_top_k ?? 3, minScore: row.researcher_min_score ?? 0.67, prompt: row.researcher_prompt ?? researcherPrompt }, 0.05)] };
    config.procedure = { steps: [legacyStep({ method: row.procedure_method ?? "embedding", topK: row.procedure_top_k ?? 1, minScore: row.procedure_min_score ?? 0, prompt: row.procedure_prompt ?? procedurePrompt }, 1)] };
  }
  await pool.query(`update router_config set pipeline = $1 where id = 1`, [JSON.stringify(config)]);
}

export async function readRouterConfig(pool: pg.Pool): Promise<RouterConfig> {
  const { rows } = await pool.query<{ pipeline: unknown }>(`select pipeline from router_config where id = 1`);
  return routerConfigSchema.parse(rows[0]?.pipeline) as RouterConfig;
}

export async function writeRouterConfig(pool: pg.Pool, config: RouterConfig) {
  await pool.query(`update router_config set pipeline = $1 where id = 1`, [JSON.stringify(config)]);
}
