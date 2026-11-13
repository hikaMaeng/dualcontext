import express from "express";
import { z } from "zod";
import { type Deps } from "../augment/index.js";
import { readDatabaseStatus } from "../db/index.js";
import { aiServerRouter } from "./ai-server/index.js";
import { proceduresRouter } from "./procedures/index.js";
import { researchersRouter } from "./researchers/index.js";
import { routerRouter } from "./router/index.js";
import { runAndLog, runsRouter } from "./runs/index.js";
import { writersRouter } from "./writers/index.js";

/** 관리자 API. /api/admin 아래에 붙는다. 인증이 없으므로 게시 포트는 루프백으로만 연다. */
export function adminRouter(deps: Deps) {
  const router = express.Router();
  router.use(express.json());
  router.use(researchersRouter(deps.pool));
  router.use(proceduresRouter(deps.pool));
  router.use(routerRouter(deps.pool));
  router.use(writersRouter(deps.pool));
  router.use(aiServerRouter(deps.pool, deps.model));
  router.use(runsRouter(deps));

  router.get("/status", async (_request, response) => {
    response.json(await readDatabaseStatus(deps.pool));
  });

  // 시험 실행: MCP 도구와 동일한 증강 경로. writerId 를 주면 그 라이터로 돌려 본다.
  // 성공이든 실패든 실행 로그가 남고, 응답에 runId 가 들어 있다.
  router.post("/augment", async (request, response) => {
    const parsed = z.object({ query: z.string().trim().min(1), writerId: z.number().int().optional() }).safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const { runId, result, answers, error } = await runAndLog(deps, parsed.data.query, parsed.data.writerId);
    if (error) return void response.status(502).json({ error, runId });
    response.json({ ...result, answers, runId });
  });

  return router;
}
