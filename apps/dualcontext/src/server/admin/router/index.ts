import express from "express";
import type pg from "pg";
import { z } from "zod";
import { readRouterConfig } from "../../routing/index.js";

const method = z.enum(["keyword", "embedding", "llm"]);
const body = z.object({
  researcherMethod: method,
  researcherTopK: z.number().int().min(1).max(20),
  researcherPrompt: z.string(),
  procedureMethod: method,
  procedureTopK: z.number().int().min(1).max(20),
  procedurePrompt: z.string()
});

/** 라우터 설정: 1단계 조사원 선택과 2단계 프로시저 선택의 방법·상위 개수·LLM 프롬프트. */
export function routerRouter(pool: pg.Pool) {
  const router = express.Router();

  router.get("/router", async (_request, response) => {
    response.json(await readRouterConfig(pool));
  });

  router.put("/router", async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const d = parsed.data;
    await pool.query(
      `update router_config set researcher_method = $1, researcher_top_k = $2, researcher_prompt = $3,
         procedure_method = $4, procedure_top_k = $5, procedure_prompt = $6 where id = 1`,
      [d.researcherMethod, d.researcherTopK, d.researcherPrompt, d.procedureMethod, d.procedureTopK, d.procedurePrompt]
    );
    response.json(await readRouterConfig(pool));
  });

  return router;
}
