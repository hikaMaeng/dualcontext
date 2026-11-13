import express from "express";
import type { AugmentResult } from "dualcontext_domain/common";
import { augment, type Deps } from "../../augment/index.js";
import { readRouterConfig } from "../../routing/index.js";
import { loadWriter } from "../../writer/index.js";

/** 보관 상한. 이보다 오래된 로그는 새 로그를 쓸 때 지운다. */
const keepLatest = 500;

/**
 * 결과를 만든 설정의 스냅샷. API 키는 담지 않는다.
 * 라우터 · 라이터 · 모델이 나중에 바뀌어도 이 실행을 이해할 수 있어야 한다.
 */
async function snapshot(deps: Deps, writerId?: number) {
  const [router, writer, ai] = await Promise.all([readRouterConfig(deps.pool), loadWriter(deps.pool, writerId), deps.model.settings()]);
  return {
    router,
    writer: writer && { id: writer.id, name: writer.name, engine: writer.engine, mode: writer.mode, prompt: writer.prompt },
    embedding: { baseUrl: ai.embedding.baseUrl, model: ai.embedding.model },
    chat: { baseUrl: ai.chat.baseUrl, model: ai.chat.model }
  };
}

/** 시험 실행을 돌리고 성공이든 실패든 로그를 남긴다. 로그 id 를 함께 돌려준다. */
export async function runAndLog(deps: Deps, query: string, writerId?: number) {
  const started = Date.now();
  const settings = await snapshot(deps, writerId);
  let result: AugmentResult | null = null;
  let error: string | null = null;
  try {
    result = await augment(deps, query, writerId);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const { rows } = await deps.pool.query<{ id: number }>(
    `insert into augment_runs (query, status, error, duration_ms, researcher_routing, settings, pairs, context)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [query, error ? "error" : "ok", error, Date.now() - started, result?.researcherRouting ?? null, settings, JSON.stringify(result?.pairs ?? []), result?.context ?? null]
  );
  await deps.pool.query(`delete from augment_runs where id not in (select id from augment_runs order by id desc limit $1)`, [keepLatest]);
  return { runId: rows[0].id, result, error };
}

export function runsRouter(deps: Deps) {
  const router = express.Router();

  router.get("/runs", async (_request, response) => {
    const { rows } = await deps.pool.query(
      `select id, created_at as "createdAt", left(query, 120) as query, status, duration_ms as "durationMs",
              researcher_routing as "researcherRouting", jsonb_array_length(pairs) as "pairCount",
              settings #>> '{writer,name}' as "writerName"
         from augment_runs order by id desc limit 200`
    );
    response.json(rows);
  });

  router.get("/runs/:id", async (request, response) => {
    const { rows } = await deps.pool.query(
      `select id, created_at as "createdAt", query, status, error, duration_ms as "durationMs",
              researcher_routing as "researcherRouting", settings, pairs, context
         from augment_runs where id = $1`,
      [Number(request.params.id)]
    );
    if (rows.length === 0) return void response.status(404).json({ error: "not found" });
    response.json(rows[0]);
  });

  router.delete("/runs/:id", async (request, response) => {
    await deps.pool.query("delete from augment_runs where id = $1", [Number(request.params.id)]);
    response.status(204).end();
  });

  return router;
}
