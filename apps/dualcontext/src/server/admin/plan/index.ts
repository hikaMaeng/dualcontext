import express from "express";
import type pg from "pg";
import type { ContextPlanConfig } from "dualcontext_domain/common";
import { defaultPlanConfig, planConfigSchema, readPlanConfig, writePlanConfig } from "../../plan/config/index.js";
import { defaultPlanPrompts } from "../../plan/prompts/index.js";

/**
 * 컨텍스트 계획 설정(모드 · 한도 · 통과조건 · 프롬프트 4종). 저장은 plan_config 단일 행이다.
 * PUT 은 설정 전체를 받는다(부분 갱신 아님). 검증 실패는 400 이고 저장된 값은 그대로다.
 */
export function planRouter(pool: pg.Pool) {
  const router = express.Router();

  router.get("/plan/config", async (_request, response) => {
    response.json(await readPlanConfig(pool));
  });

  router.put("/plan/config", async (request, response) => {
    const parsed = planConfigSchema.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    await writePlanConfig(pool, parsed.data as ContextPlanConfig);
    response.json(await readPlanConfig(pool));
  });

  // 화면이 「기본값으로」 되돌릴 때 쓴다: 처음 상태의 설정과 기본 프롬프트.
  router.get("/plan/defaults", (_request, response) => {
    response.json({ config: defaultPlanConfig(), prompts: { ...defaultPlanPrompts } });
  });

  return router;
}
