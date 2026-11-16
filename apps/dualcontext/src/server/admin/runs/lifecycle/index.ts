import { EventEmitter } from "node:events";
import type pg from "pg";
import type { Answers, AugmentResult, ContextMode, ContextPlanConfig, PlanTrace } from "dualcontext_domain/common";
import type { PlanProgress } from "dualcontext_domain/server";
import { answerPrompts, generateAnswers } from "../../../answer/index.js";
import { runAugment, type Deps, type RunAugmentEngine } from "../../../augment/index.js";
import { applyPlanOverride, readPlanConfig, type PlanOverride } from "../../../plan/config/index.js";
import { readRouterConfig } from "../../../routing/config/index.js";
import { loadWriter } from "../../../writer/index.js";
import { embedRunQuery } from "../embedding/index.js";

/** 보관 상한. 이보다 오래된 로그는 새 로그를 쓸 때 지운다. */
const keepLatest = 500;

/** 진행 상황 방송. 키는 runId 문자열, 값은 그 시점의 상세 행. 프로세스 안에서만 유효하다(서버는 프로세스 하나). */
export const bus = new EventEmitter();
bus.setMaxListeners(0);

const detailColumns = `id, created_at as "createdAt", query, status, stage, error, duration_ms as "durationMs",
  researcher_routing as "researcherRouting", routing, settings, pairs, context, answers, plan, plan_progress as "planProgress"`;

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
 * plan 은 이번 실행에 실제로 쓴 계획 설정(모드 · override 적용 후, 프롬프트 포함)이다. classic 실행에도 모드를 알 수 있게 남긴다.
 */
async function snapshot(deps: Deps, plan: ContextPlanConfig, writerId?: number) {
  const [router, writer, ai] = await Promise.all([readRouterConfig(deps.pool), loadWriter(deps.pool, writerId), deps.model.settings()]);
  return {
    plan,
    router,
    writer: writer && { id: writer.id, name: writer.name, engine: writer.engine, mode: writer.mode, prompt: writer.prompt },
    embedding: { baseUrl: ai.embedding.baseUrl, model: ai.embedding.model },
    chat: { baseUrl: ai.chat.baseUrl, model: ai.chat.model },
    answer: answerPrompts
  };
}

type Outcome = { result: AugmentResult | null; plan: PlanTrace | null; answers: Answers | null; error: string | null };

/** 시험 실행 한 번의 계획 선택: 모드와 숫자 한도 override(POST /augment 본문). 저장된 설정은 바꾸지 않는다. */
export type RunPlanChoice = { mode?: ContextMode; override?: PlanOverride };

/**
 * 계획 진행 기록(plan_progress). 플래너의 진행 알림에는 부분 trace 가 없어 단계 이름만 남긴다. 끝나면 plan 열에 trace 전체가 실린다.
 * 기록 실패는 실행을 멈추지 않는다(플래너도 진행 알림 실패를 무시한다).
 */
async function recordProgress(deps: Deps, runId: number, event: PlanProgress) {
  await deps.pool.query(`update augment_runs set plan_progress = $2 where id = $1`, [runId, JSON.stringify({ ...event, at: new Date().toISOString() })]);
  await publish(deps.pool, runId);
}

/** 백그라운드 작업 본체. 단계마다 행을 고치고 방송한다. 절대 거부(reject)되지 않는다. */
async function execute(deps: Deps, runId: number, query: string, config: ContextPlanConfig, writerId?: number, engine?: RunAugmentEngine): Promise<Outcome> {
  const started = Date.now();
  let result: AugmentResult | null = null;
  let plan: PlanTrace | null = null;
  let answers: Answers | null = null;
  let error: string | null = null;
  try {
    const outcome = await runAugment(deps, query, { writerId, config, onProgress: (event) => recordProgress(deps, runId, event) }, engine);
    result = outcome.result;
    plan = outcome.plan;
    await deps.pool.query(
      `update augment_runs set researcher_routing = $2, pairs = $3, context = $4, routing = $5, plan = $6, stage = 'answering', answers = '{}'::jsonb where id = $1`,
      [runId, result.researcherRouting, JSON.stringify(result.pairs), result.context, JSON.stringify(result.routing), plan === null ? null : JSON.stringify(plan)]
    );
    await publish(deps.pool, runId);
    // 증강한 컨텍스트로 최종 답변까지 받는다. 비교를 위해 증강 전(질의만) 답변도 함께 만들고, 끝나는 대로 기록한다.
    answers = await generateAnswers(deps.model, query, result.context, async (which, answer) => {
      await deps.pool.query(
        `update augment_runs set answers = coalesce(answers, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb) where id = $1`,
        [runId, which, JSON.stringify(answer)]
      );
      await publish(deps.pool, runId);
    }, outcome.answerAfter);
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
  return { result, plan, answers, error };
}

/**
 * 시험 실행을 시작한다. 행을 running 으로 만들고 작업을 백그라운드로 보낸 뒤 바로 runId 를 돌려준다.
 * done 을 기다리면 예전 동기 호출처럼 끝까지 기다릴 수 있다.
 * choice 가 없으면 저장된 계획 설정(모드 포함) 그대로다. engine 은 테스트용이다.
 */
export async function startRun(deps: Deps, query: string, writerId?: number, choice: RunPlanChoice = {}, engine?: RunAugmentEngine) {
  const plan = applyPlanOverride(await readPlanConfig(deps.pool), choice.mode, choice.override);
  const settings = await snapshot(deps, plan, writerId);
  const { rows } = await deps.pool.query<{ id: number }>(
    `insert into augment_runs (query, status, stage, duration_ms, settings, pairs) values ($1, 'running', 'augment', 0, $2, '[]') returning id`,
    [query, settings]
  );
  const runId = rows[0].id;
  // 질의 임베딩(의미 검색용)은 기다리지 않고 따로 계산한다. 실패해도 실행에는 영향이 없다.
  void embedRunQuery(deps.pool, deps.model, runId, query);
  await deps.pool.query(`delete from augment_runs where id not in (select id from augment_runs order by id desc limit $1)`, [keepLatest]);
  return { runId, done: execute(deps, runId, query, plan, writerId, engine) };
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
