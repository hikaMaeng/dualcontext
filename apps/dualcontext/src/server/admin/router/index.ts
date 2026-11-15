import express from "express";
import { z } from "zod";
import type { RouterConfig } from "dualcontext_domain/common";
import { selectForQuery } from "dualcontext_domain/server";
import type { Deps } from "../../augment/index.js";
import { defaultRouterConfig, readRouterConfig, routerConfigSchema, writeRouterConfig } from "../../routing/config/index.js";
import { individualPrompt, procedurePrompt, researcherPrompt, splitPrompt } from "../../routing/config/prompts.js";
import { createSelectors } from "../../routing/index.js";
import { listProceduresOf } from "../procedures/index.js";
import { listResearchers } from "../researchers/index.js";

/**
 * 라우터 설정: 질의 분해 방법과, 1단계(조사원) · 2단계(프로시저)의 라우팅 단계 파이프라인.
 * POST /router/preview 는 질의 하나의 라우팅만 돌려 본다(자료 수집과 라이터는 부르지 않는다).
 * 저장하지 않은 설정(config)을 함께 보내면 그 설정으로 돌린다: 저장 전에 효과를 보거나 설정을 비교 측정할 때 쓴다.
 * procedures 를 false 로 보내면 2단계(프로시저 선택)는 돌리지 않는다.
 */
export function routerRouter(deps: Deps) {
  const { pool } = deps;
  const router = express.Router();

  router.get("/router", async (_request, response) => {
    response.json(await readRouterConfig(pool));
  });

  // 새 LLM 단계를 만들 때 채울 기본 프롬프트와, 처음 상태(기본 설정).
  router.get("/router/defaults", (_request, response) => {
    response.json({ config: defaultRouterConfig(), prompts: { researcher: researcherPrompt, procedure: procedurePrompt, split: splitPrompt, individual: individualPrompt } });
  });

  router.put("/router", async (request, response) => {
    const parsed = routerConfigSchema.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    await writeRouterConfig(pool, parsed.data as RouterConfig);
    response.json(await readRouterConfig(pool));
  });

  router.post("/router/preview", async (request, response) => {
    const parsed = z.object({ query: z.string().trim().min(1), config: routerConfigSchema.optional(), procedures: z.boolean().default(true) }).safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const config = (parsed.data.config as RouterConfig | undefined) ?? (await readRouterConfig(pool));
    const selectors = createSelectors(deps.pool, deps.model, { config: async () => config });
    const started = Date.now();
    try {
      const researchers = await listResearchers(pool);
      const picked = await selectForQuery(parsed.data.query, researchers, selectors);
      const researcherMs = Date.now() - started;
      const procedures = [];
      for (const researcher of parsed.data.procedures ? picked.merged.selected : []) {
        const selection = await selectors.selectProcedures(parsed.data.query, researcher, await listProceduresOf(pool, researcher.id));
        procedures.push({ researcher: researcher.name, mode: selection.mode, selected: selection.selected.map((procedure) => procedure.name), steps: selection.steps ?? [] });
      }
      response.json({
        parts: picked.parts,
        mode: picked.merged.mode,
        selected: picked.merged.selected.map((researcher) => researcher.name),
        asked: picked.asked.map((entry) => ({ asked: entry.asked, mode: entry.selection.mode, selected: entry.selection.selected.map((researcher) => researcher.name), steps: entry.selection.steps ?? [], individual: entry.selection.individual ?? [] })),
        scores: (picked.merged.scores ?? []).map((entry) => ({ name: researchers.find((researcher) => researcher.id === entry.id)?.name ?? String(entry.id), score: Number(entry.score.toFixed(4)), selected: entry.selected })),
        procedures,
        researcherMs,
        ms: Date.now() - started
      });
    } catch (error) {
      response.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
