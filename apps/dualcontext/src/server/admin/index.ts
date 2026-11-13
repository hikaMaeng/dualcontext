import express from "express";
import { z } from "zod";
import { type Deps } from "../augment/index.js";
import { readDatabaseStatus } from "../db/index.js";
import { aiServerRouter } from "./ai-server/index.js";
import { proceduresRouter } from "./procedures/index.js";
import { researchersRouter } from "./researchers/index.js";
import { routerRouter } from "./router/index.js";
import { runsRouter, startRun } from "./runs/index.js";
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

  // 시험 실행: MCP 도구와 같은 증강 경로 + 증강 전 · 후 최종 답변. writerId 를 주면 그 라이터로 돌려 본다.
  // 기본은 비동기다: 실행 기록(running)을 만들고 바로 202 { runId } 를 돌려주며, 진행은
  //   GET /runs/:id (폴링) 또는 GET /runs/:id/events (SSE) 로 본다.
  // ?wait=1 이면 예전처럼 끝날 때까지 기다려 결과 전체를 돌려준다(스크립트 호환용).
  router.post("/augment", async (request, response) => {
    const parsed = z.object({ query: z.string().trim().min(1), writerId: z.number().int().optional() }).safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const { runId, done } = await startRun(deps, parsed.data.query, parsed.data.writerId);

    if (request.query.wait !== "1" && request.query.wait !== "true") {
      return void response.status(202).location(`/api/admin/runs/${runId}`).json({ runId, status: "running" });
    }
    const { result, answers, error } = await done;
    if (error) return void response.status(502).json({ error, runId });
    response.json({ ...result, answers, runId });
  });

  return router;
}
