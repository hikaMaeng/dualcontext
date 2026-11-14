import { EventEmitter } from "node:events";
import express from "express";
import type pg from "pg";
import type { Answers, AugmentResult } from "dualcontext_domain/common";
import { answerPrompts, generateAnswers } from "../../answer/index.js";
import { augment, type Deps } from "../../augment/index.js";
import { readRouterConfig } from "../../routing/config/index.js";
import { loadWriter } from "../../writer/index.js";

/** 보관 상한. 이보다 오래된 로그는 새 로그를 쓸 때 지운다. */
const keepLatest = 500;

/** 진행 상황 방송. 키는 runId 문자열, 값은 그 시점의 상세 행. 프로세스 안에서만 유효하다(서버는 프로세스 하나). */
const bus = new EventEmitter();
bus.setMaxListeners(0);

const detailColumns = `id, created_at as "createdAt", query, status, stage, error, duration_ms as "durationMs",
  researcher_routing as "researcherRouting", routing, settings, pairs, context, answers`;

export async function readRun(pool: pg.Pool, id: number) {
  const { rows } = await pool.query(`select ${detailColumns} from augment_runs where id = $1`, [id]);
  return rows[0] ?? null;
}

async function publish(pool: pg.Pool, runId: number) {
  const detail = await readRun(pool, runId);
  if (detail) bus.emit(String(runId), detail);
}

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
    chat: { baseUrl: ai.chat.baseUrl, model: ai.chat.model },
    answer: answerPrompts
  };
}

type Outcome = { result: AugmentResult | null; answers: Answers | null; error: string | null };

/** 백그라운드 작업 본체. 단계마다 행을 고치고 방송한다. 절대 거부(reject)되지 않는다. */
async function execute(deps: Deps, runId: number, query: string, writerId?: number): Promise<Outcome> {
  const started = Date.now();
  let result: AugmentResult | null = null;
  let answers: Answers | null = null;
  let error: string | null = null;
  try {
    result = await augment(deps, query, writerId);
    await deps.pool.query(
      `update augment_runs set researcher_routing = $2, pairs = $3, context = $4, routing = $5, stage = 'answering', answers = '{}'::jsonb where id = $1`,
      [runId, result.researcherRouting, JSON.stringify(result.pairs), result.context, JSON.stringify(result.routing)]
    );
    await publish(deps.pool, runId);
    // 증강한 컨텍스트로 최종 답변까지 받는다. 비교를 위해 증강 전(질의만) 답변도 함께 만들고, 끝나는 대로 기록한다.
    answers = await generateAnswers(deps.model, query, result.context, async (which, answer) => {
      await deps.pool.query(
        `update augment_runs set answers = coalesce(answers, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb) where id = $1`,
        [runId, which, JSON.stringify(answer)]
      );
      await publish(deps.pool, runId);
    });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  try {
    await deps.pool.query(`update augment_runs set status = $2, stage = 'done', error = $3, duration_ms = $4 where id = $1`, [
      runId, error ? "error" : "ok", error, Date.now() - started
    ]);
    await publish(deps.pool, runId);
  } catch (caught) {
    console.error(`run ${runId}: could not record the final state`, caught);
  }
  return { result, answers, error };
}

/**
 * 시험 실행을 시작한다. 행을 running 으로 만들고 작업을 백그라운드로 보낸 뒤 바로 runId 를 돌려준다.
 * done 을 기다리면 예전 동기 호출처럼 끝까지 기다릴 수 있다.
 */
export async function startRun(deps: Deps, query: string, writerId?: number) {
  const settings = await snapshot(deps, writerId);
  const { rows } = await deps.pool.query<{ id: number }>(
    `insert into augment_runs (query, status, stage, duration_ms, settings, pairs) values ($1, 'running', 'augment', 0, $2, '[]') returning id`,
    [query, settings]
  );
  const runId = rows[0].id;
  await deps.pool.query(`delete from augment_runs where id not in (select id from augment_runs order by id desc limit $1)`, [keepLatest]);
  return { runId, done: execute(deps, runId, query, writerId) };
}

/**
 * 서버가 시작될 때 running 으로 남은 행을 오류로 닫는다. 이전 프로세스의 작업은 재시작과 함께 사라졌기 때문이다.
 * MCP stdio 프로세스(서버와 별개 프로세스)에서는 부르지 않는다: 서버의 진행 중인 작업을 잘못 닫게 된다.
 */
export async function abandonRunningRuns(pool: pg.Pool) {
  const { rowCount } = await pool.query(
    `update augment_runs set status = 'error', stage = 'done', error = '서버가 다시 시작되어 실행이 중단되었다' where status = 'running'`
  );
  return rowCount ?? 0;
}

export function runsRouter(deps: Deps) {
  const router = express.Router();

  router.get("/runs", async (_request, response) => {
    const { rows } = await deps.pool.query(
      `select id, created_at as "createdAt", left(query, 120) as query, status, stage, duration_ms as "durationMs",
              researcher_routing as "researcherRouting", jsonb_array_length(pairs) as "pairCount",
              settings #>> '{writer,name}' as "writerName"
         from augment_runs order by id desc limit 200`
    );
    response.json(rows);
  });

  // 폴링용: 현재 상태 전체. running 이면 같은 주소를 다시 부르면 된다.
  router.get("/runs/:id", async (request, response) => {
    const detail = await readRun(deps.pool, Number(request.params.id));
    if (!detail) return void response.status(404).json({ error: "not found" });
    response.json(detail);
  });

  // 실시간용(SSE): 상태가 바뀔 때마다 상세 행 전체를 보내고, 끝나면 스트림을 닫는다.
  router.get("/runs/:id/events", async (request, response) => {
    const id = Number(request.params.id);
    // 구독을 먼저 걸고 현재 상태를 읽는다. 그 사이에 바뀐 상태를 놓치지 않기 위해서다(중복 전송은 해롭지 않다).
    const pending: { status: string }[] = [];
    let live = false;
    const send = (detail: unknown) => response.write(`data: ${JSON.stringify(detail)}\n\n`);
    const onUpdate = (detail: { status: string }) => {
      if (!live) return void pending.push(detail);
      send(detail);
      if (detail.status !== "running") finish();
    };
    const beat = setInterval(() => response.write(": keep-alive\n\n"), 15_000);
    function finish() {
      clearInterval(beat);
      bus.off(String(id), onUpdate);
      response.end();
    }
    bus.on(String(id), onUpdate);
    request.on("close", finish);

    const first = await readRun(deps.pool, id);
    if (!first) {
      clearInterval(beat);
      bus.off(String(id), onUpdate);
      return void response.status(404).json({ error: "not found" });
    }
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
    send(first);
    live = true;
    for (const detail of pending) send(detail);
    // 가장 최근 상태가 끝난 상태면 더 보낼 것이 없다.
    if ((pending.at(-1)?.status ?? first.status) !== "running") finish();
  });

  router.delete("/runs/:id", async (request, response) => {
    const id = Number(request.params.id);
    const { rowCount } = await deps.pool.query("delete from augment_runs where id = $1 and status <> 'running'", [id]);
    if (rowCount === 0 && (await readRun(deps.pool, id))) return void response.status(409).json({ error: "run is still running" });
    response.status(204).end();
  });

  return router;
}
