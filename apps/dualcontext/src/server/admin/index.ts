import express from "express";
import { z } from "zod";
import { type Deps } from "../augment/index.js";
import { readDatabaseStatus } from "../db/index.js";
import { eventLoopSnapshot } from "../metrics/index.js";
import { runRegistry } from "../run/index.js";
import { aiServerRouter } from "./ai-server/index.js";
import { contextModeSchema, planOverrideSchema } from "../plan/config/index.js";
import { crawlRouter } from "./crawl/index.js";
import { planRouter } from "./plan/index.js";
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
  router.use(crawlRouter(deps));
  router.use(proceduresRouter(deps.pool));
  router.use(routerRouter(deps));
  router.use(planRouter(deps.pool));
  router.use(writersRouter(deps.pool));
  router.use(aiServerRouter(deps.pool, deps.model));
  router.use(runsRouter(deps));

  // 데이터베이스 상태 + 실행 계측: 추론 큐(소비자 수 · 진행 중 · 대기 · 지연 재투입 · 발행 · 재시도), 진행 중 실행 수, 이벤트 루프 지연(읽으면 비워진다).
  router.get("/status", async (_request, response) => {
    response.json({ ...(await readDatabaseStatus(deps.pool)), queues: deps.model.stats(), activeRuns: runRegistry.size(), eventLoop: eventLoopSnapshot() });
  });

  // 시험 실행: MCP 도구와 같은 증강 경로 + 증강 전 · 후 최종 답변. writerId 를 주면 그 라이터로 돌려 본다.
  // 기본은 비동기다: 실행 기록(running)을 만들고 바로 202 { runId } 를 돌려주며, 진행은
  //   GET /runs/:id (폴링) 또는 GET /runs/:id/events (SSE) 로 본다.
  // ?wait=1 이면 예전처럼 끝날 때까지 기다려 결과 전체를 돌려준다(스크립트 호환용).
  // mode · plan(숫자 한도만)은 이번 실행에만 적용한다. 저장된 계획 설정은 바꾸지 않는다. 없으면 저장된 설정의 모드다.
  router.post("/augment", async (request, response) => {
    const parsed = z
      .object({ query: z.string().trim().min(1), writerId: z.number().int().optional(), mode: contextModeSchema.optional(), plan: planOverrideSchema.optional() })
      .safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const { runId, done } = await startRun(deps, parsed.data.query, parsed.data.writerId, { mode: parsed.data.mode, override: parsed.data.plan });

    if (request.query.wait !== "1" && request.query.wait !== "true") {
      return void response.status(202).location(`/api/admin/runs/${runId}`).json({ runId, status: "running" });
    }
    const { result, plan, answers, error } = await done;
    if (error) return void response.status(502).json({ error, runId });
    response.json({ ...result, plan, answers, runId });
  });

  return router;
}
