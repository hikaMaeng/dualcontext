import { EventEmitter } from "node:events";
import type pg from "pg";
import { isRunAborted, runNodeKey, type Answers, AugmentResult, ContextMode, ContextPlanConfig, PlanTrace, type McpEffort, type RunSource } from "dualcontext_domain/common";
import type { PlanProgress } from "dualcontext_domain/server";
import { answerPrompts, generateAnswers } from "../../../answer/index.js";
import { runAugment, type Deps, type RunAugmentEngine } from "../../../augment/index.js";
import { applyPlanOverride, readPlanConfig, type PlanOverride } from "../../../plan/config/index.js";
import { readRouterConfig } from "../../../routing/config/index.js";
import { budgetMs, createRunContext, type RunContext } from "../../../run/index.js";
import { loadWriter } from "../../../writer/index.js";
import { recordModel } from "../../../plan/calls/index.js";
import { createNodeSaver } from "../nodes/index.js";
import { embedRunQuery } from "../embedding/index.js";
import { createRunWriter, type RunWriter } from "../writer/index.js";

/** 보관 상한. 이보다 오래된 **종료된** 로그는 새 로그를 쓸 때 지운다(진행 중인 실행은 지우지 않는다). */
const keepLatest = 500;

/** 진행 상황 방송. 키는 runId 문자열, 값은 그 시점의 상세 행. 프로세스 안에서만 유효하다(엔진은 서버 프로세스 하나가 소유한다). */
export const bus = new EventEmitter();
bus.setMaxListeners(0);

/**
 * 가벼운 진행 알림(단계 이름만). MCP 중계가 진행 알림을 만들 때 쓴다: 전체 행을 읽는 bus 와 달리 DB 를 읽지 않는다.
 * 키: runId 문자열. 구독자가 없으면 발행은 비용이 거의 없다.
 */
export const progressBus = new EventEmitter();
progressBus.setMaxListeners(0);

const detailColumns = `id, created_at as "createdAt", query, source, effort, status, stage, error, duration_ms as "durationMs",
  researcher_routing as "researcherRouting", routing, settings, pairs, context, answers, plan, plan_progress as "planProgress",
  coalesce((select array_agg(n.key order by n.key) from augment_run_nodes n where n.run_id = augment_runs.id), '{}') as "nodes"`;

export async function readRun(pool: pg.Pool, id: number) {
  const { rows } = await pool.query(`select ${detailColumns} from augment_runs where id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * 구독자가 있을 때만 전체 행을 읽어 방송한다(없는데 읽으면 큰 행을 읽고 버리는 일이 된다).
 * fallback 은 DB 재조회가 실패했을 때 대신 내보낼 메모리 상태다(종료 상태가 구독자에게 전달되지 못하는 일을 막는다).
 */
async function publish(pool: pg.Pool, runId: number, fallback?: Record<string, unknown>) {
  if (bus.listenerCount(String(runId)) === 0) return;
  try {
    const detail = await readRun(pool, runId);
    if (detail) bus.emit(String(runId), detail);
  } catch (error) {
    if (fallback) bus.emit(String(runId), fallback);
    else throw error;
  }
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

type Outcome = {
  result: AugmentResult | null;
  plan: PlanTrace | null;
  answers: Answers | null;
  error: string | null;
  /** 취소 · 종료로 끝난 경우의 사유(결과를 돌려줄 수 없다). 시한 만료의 부분 결과는 error 가 null 이고 plan.stop 이 "deadline" 이다. */
  aborted?: "cancelled" | "shutdown";
};

/** 시험 실행 한 번의 계획 선택: 모드와 숫자 한도 override(POST /augment 본문). 저장된 설정은 바꾸지 않는다. */
export type RunPlanChoice = { mode?: ContextMode; override?: PlanOverride };

/**
 * 계획 진행 기록(plan_progress). 플래너의 진행 알림에는 단계 이름만 있다. 부분 trace 는 createTraceSaver 가 plan 열에 따로 쓰고, 끝나면 trace 전체가 실린다.
 * 기록 실패는 실행을 멈추지 않는다(플래너도 진행 알림 실패를 무시한다). 실행이 running 일 때만 쓴다.
 */
async function recordProgress(writer: RunWriter, publishRun: () => Promise<void>, runId: number, event: PlanProgress) {
  progressBus.emit(String(runId), event);
  await writer.query(`update augment_runs set plan_progress = $2 where id = $1 and status = 'running'`, [runId, JSON.stringify({ ...event, at: new Date().toISOString() })]);
  await publishRun();
}

/**
 * 계획의 부분 trace 저장기. 부분 trace 는 **최신 상태 표본**이다: push 는 참조만 바꾸고, 주기(기본 1초)마다 그 시점의 trace 를 직렬화해 plan 열에 쓴다
 * (단계마다 전체를 직렬화하던 동기 비용을 없앤다. 플래너는 await 사이에서만 객체를 바꾸므로 타이머 시점의 객체는 일관된 상태다).
 * 쓰기는 한 번에 하나씩이고 쓰기 실패는 실행을 멈추지 않는다. settle 은 대기 중인 표본을 지금 한 번 쓰고 진행 중인 쓰기가 끝날 때까지 기다린 뒤 저장기를 닫는다 —
 * 최종 trace 를 쓰기 전에 불러 부분 trace 가 최종을 덮지 않게 한다. close 뒤의 push 는 무시한다.
 * 키: runId(실행 하나당 저장기 하나). 수명: execute 한 번. 상한: 대기는 최신 참조 하나. 비우는 쪽: settle.
 */
export function createTraceSaver(writer: RunWriter, runId: number, publishRun: () => Promise<void> = async () => undefined, intervalMs = 1000) {
  let latest: PlanTrace | null = null;
  let dirty = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> | null = null;

  const writeNow = async () => {
    if (!dirty || latest === null) return;
    dirty = false;
    try {
      await writer.query(`update augment_runs set plan = $2 where id = $1 and status = 'running'`, [runId, JSON.stringify(latest)]);
      await publishRun();
    } catch {
      // 부분 기록 실패는 건너뛴다. 다음 표본 또는 최종 기록이 다시 쓴다.
    }
  };
  const schedule = () => {
    if (timer !== undefined || closed) return;
    timer = setTimeout(() => {
      timer = undefined;
      writing = writeNow().finally(() => {
        writing = null;
        if (dirty) schedule();
      });
    }, intervalMs);
  };
  return {
    push(trace: PlanTrace) {
      if (closed) return;
      latest = trace;
      dirty = true;
      schedule();
    },
    async settle() {
      // 먼저 닫는다: 이후 push 는 무시되고, 진행 중인 쓰기의 finally 가 새 타이머를 걸지 않는다.
      closed = true;
      clearTimeout(timer);
      timer = undefined;
      while (writing !== null) await writing;
      await writeNow();
    }
  };
}

/** 실행 시한 · 취소에 걸린 정리 예산(ms): 이 안에 저장이 끝나지 않으면 남은 쓰기를 버리고 종료 상태를 확정한다. */
const cleanupBudgetMs = 5000;

async function within<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

/** 백그라운드 작업 본체. 단계마다 행을 고치고 방송한다. 절대 거부(reject)되지 않는다. */
async function execute(deps: Deps, runId: number, query: string, config: ContextPlanConfig, ctx: RunContext, writerId?: number, engine?: RunAugmentEngine, source: RunSource = "test"): Promise<Outcome> {
  const started = Date.now();
  let result: AugmentResult | null = null;
  let plan: PlanTrace | null = null;
  let answers: Answers | null = null;
  let error: string | null = null;
  let aborted: Outcome["aborted"];
  // 이 실행의 모델 호출은 모두 실행에 바인딩된 façade 로 간다: runKey(공정성 단위)와 취소 신호가 자동으로 붙는다.
  const runDeps: Deps = { ...deps, model: deps.model.forRun({ runKey: String(runId), signal: ctx.signal }) };
  const writer = createRunWriter(deps.pool);
  const publishRun = () => publish(deps.pool, runId);
  const saver = createTraceSaver(writer, runId, publishRun);
  const nodes = createNodeSaver(writer, runId, publishRun);
  try {
    const outcome = await runAugment(runDeps, query, { writerId, config, signal: ctx.signal, onProgress: (event) => recordProgress(writer, publishRun, runId, event), onTrace: (trace) => saver.push(trace), onNode: nodes.push }, engine);
    result = outcome.result;
    plan = outcome.plan;
    await saver.settle();
    await nodes.settle();
    await writer.query(
      `update augment_runs set researcher_routing = $2, pairs = $3, context = $4, routing = $5, plan = $6, stage = 'answering', answers = '{}'::jsonb where id = $1 and status = 'running'`,
      [runId, result.researcherRouting, JSON.stringify(result.pairs), result.context, JSON.stringify(result.routing), plan === null ? null : JSON.stringify(plan)]
    );
    await publishRun();
    // 증강한 컨텍스트로 최종 답변까지 받는다. 비교를 위해 증강 전(질의만) 답변도 함께 만들고, 끝나는 대로 기록한다.
    // 답변마다 따로 감싸 두 호출이 섞이지 않게 한다. 계획의 마지막 답을 재사용했거나 컨텍스트가 비어 모델을 부르지 않은 쪽은 calls 가 없어 노드를 남기지 않는다.
    const recorders = { before: recordModel(runDeps.model, "answer"), after: recordModel(runDeps.model, "answer") };
    // MCP 호출은 컨텍스트만 돌려주므로 최종 답변(증강 전 · 후)을 만들지 않는다. 시한이 만료된 실행도 부분 결과를 그대로 둔다(추가 호출 없음).
    if (source !== "mcp" && plan?.stop !== "deadline") answers = await generateAnswers(runDeps.model, query, result.context, async (which, answer) => {
      const calls = recorders[which].calls();
      if (calls.length > 0) nodes.push(runNodeKey.finalAnswer(which), { calls });
      await writer.query(
        `update augment_runs set answers = coalesce(answers, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb) where id = $1 and status = 'running'`,
        [runId, which, JSON.stringify(answer)]
      );
      await publishRun();
    }, outcome.answerAfter, { before: recorders.before.model, after: recorders.after.model });
  } catch (caught) {
    if (isRunAborted(caught)) {
      aborted = caught.reason === "shutdown" ? "shutdown" : "cancelled";
      error = `취소됨(${caught.reason})`;
    } else error = caught instanceof Error ? caught.message : String(caught);
  }

  // 종료 순서: 생산자는 이미 정착했다 → 저장기 close/flush → 종료 상태 확정 → 종료 publish.
  // 정리는 취소된 신호가 아니라 유한한 예산으로 돈다. 예산을 넘기면 남은 쓰기를 버린다(writer 를 닫아 늦은 쓰기가 종료 상태를 덮지 못하게 한다).
  const flushed = await within(Promise.all([saver.settle(), nodes.settle()]), cleanupBudgetMs);
  writer.close();
  if (flushed === "timeout") console.error(`run ${runId}: cleanup budget exceeded, dropped pending writes`);
  const status = error ? "error" : "ok";
  const duration = Date.now() - started;
  try {
    await deps.pool.query(`update augment_runs set status = $2, stage = 'done', error = $3, duration_ms = $4 where id = $1 and status = 'running'`, [runId, status, error, duration]);
    await publish(deps.pool, runId, { id: runId, status, stage: "done", error, durationMs: duration, persisted: true });
  } catch (caught) {
    // 종료 기록을 DB 에 확정하지 못했다: 성공처럼 publish 하지 않는다. 구독자에게는 메모리 상태(persisted:false)로 종료를 알리고, 다음 기동의 abandonRunningRuns 가 행을 닫는다.
    console.error(`run ${runId}: could not record the final state`, caught);
    bus.emit(String(runId), { id: runId, status: "error", stage: "done", error: error ?? "종료 상태를 기록하지 못했다", durationMs: duration, persisted: false });
  } finally {
    ctx.dispose();
  }
  return { result, plan, answers, error, ...(aborted ? { aborted } : {}) };
}

/** 실행의 출처. effort 는 MCP 호출이 고른 단계(시험 실행은 없음). */
export type RunOrigin = { source: RunSource; effort?: McpEffort };

/**
 * 시험 실행을 시작한다. 행을 running 으로 만들고 작업을 백그라운드로 보낸 뒤 바로 runId 를 돌려준다.
 * done 을 기다리면 예전 동기 호출처럼 끝까지 기다릴 수 있다. cancel 은 이 실행을 취소한다(사유 cancelled).
 * choice 가 없으면 저장된 계획 설정(모드 포함) 그대로다. engine 은 테스트용이다.
 * origin.source 는 실행의 출처(시험 실행 test · MCP 호출 mcp). mcp 는 최종 답변을 만들지 않는다.
 * 선택 시한은 환경 변수 `DUALCONTEXT_BUDGET_<EFFORT>_S` 가 있는 effort 에만 걸린다(기본 없음).
 */
export async function startRun(deps: Deps, query: string, writerId?: number, choice: RunPlanChoice = {}, engine?: RunAugmentEngine, origin: RunOrigin = { source: "test" }) {
  const { source } = origin;
  const plan = applyPlanOverride(await readPlanConfig(deps.pool), choice.mode, choice.override);
  const settings = await snapshot(deps, plan, writerId);
  const { rows } = await deps.pool.query<{ id: number }>(
    `insert into augment_runs (query, status, stage, duration_ms, settings, pairs, source, effort) values ($1, 'running', 'augment', 0, $2, '[]', $3, $4) returning id`,
    [query, settings, source, origin.effort ?? null]
  );
  const runId = rows[0].id;
  const budget = budgetMs(origin.effort);
  const ctx = createRunContext(runId, budget !== undefined ? { budgetMs: budget } : {});
  // 질의 임베딩(의미 검색용)은 기다리지 않고 따로 계산한다. 실패해도 실행에는 영향이 없다. 실행의 신호를 따른다(취소되면 큐에서 빠진다).
  void embedRunQuery(deps.pool, deps.model.forRun({ runKey: String(runId), signal: ctx.signal }), runId, query);
  // 종료된 로그만 지운다: 오래 걸리는 실행(running)이 신규 실행 500건 뒤에 지워지면 상태 · 노드 저장과 취소 조회가 깨진다.
  await deps.pool.query(`delete from augment_runs where status <> 'running' and id not in (select id from augment_runs where status <> 'running' order by id desc limit $1)`, [keepLatest]);
  return { runId, done: execute(deps, runId, query, plan, ctx, writerId, engine, source), cancel: () => ctx.cancel("cancelled") };
}

/**
 * 서버가 시작될 때 running 으로 남은 행을 오류로 닫는다. 이전 프로세스의 작업은 재시작과 함께 사라졌기 때문이다.
 * 엔진은 서버 프로세스 하나가 소유하므로(MCP stdio 는 서버로 중계한다) 시작 시점의 running 행은 모두 고아다.
 */
export async function abandonRunningRuns(pool: pg.Pool) {
  const { rowCount } = await pool.query(
    `update augment_runs set status = 'error', stage = 'done', error = '서버가 다시 시작되어 실행이 중단되었다' where status = 'running'`
  );
  return rowCount ?? 0;
}
