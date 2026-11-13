import express from "express";
import type pg from "pg";
import { z } from "zod";
import { readDatabaseStatus } from "../db/index.js";
import { augment } from "../augment/index.js";
import { documentsRouter } from "./documents/index.js";
import { proceduresRouter } from "./procedures/index.js";
import { researchersRouter } from "./researchers/index.js";

/** 관리자 API. /api/admin 아래에 붙는다. 인증이 없으므로 게시 포트는 루프백으로만 연다. */
export function adminRouter(pool: pg.Pool) {
  const router = express.Router();
  router.use(express.json());
  router.use(researchersRouter(pool));
  router.use(proceduresRouter(pool));
  router.use(documentsRouter(pool));

  router.get("/status", async (_request, response) => {
    response.json(await readDatabaseStatus(pool));
  });

  // 시험 실행: MCP 도구와 동일한 증강 경로. 결과에 라우팅 결과도 함께 돌려준다.
  router.post("/augment", async (request, response) => {
    const parsed = z.object({ query: z.string().trim().min(1) }).safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    response.json(await augment(pool, parsed.data.query));
  });

  return router;
}
