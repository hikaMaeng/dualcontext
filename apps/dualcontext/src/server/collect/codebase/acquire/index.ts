import { randomUUID } from "node:crypto";
import type { Material } from "dualcontext_domain/common";
import { isAbort, raceAbort } from "../../abort/index.js";
import { buildPool, type BuildOutcome, type BuildPriority } from "../../../workers/build/index.js";
import { onShutdown } from "../../../workers/pool/index.js";
import { searchPool } from "../../../workers/search/index.js";
import { buildFor, keyOf, type BuildDeps } from "../build.js";
import type { CodebaseConfig } from "../config/index.js";
import { indexExists, indexPath, isStale } from "../store/index.js";

/**
 * 진행 중인 인덱스 만들기: 키 = 인덱스 키, 범위 = 프로세스, 같은 키의 동시 질의는 한 번의 클론 · 인덱싱을 기다린다.
 * 끝나면(성공 · 실패 · 취소) 만든 쪽이 지운다. 키 개수는 프로젝트 수 이하다.
 * 공유 작업이므로 요청이 취소돼도 죽이지 않는다: 요청은 기다림에서만 떨어지고(`raceAbort`), 작업은 자기 신호(종료 · 시한)로만 끝난다.
 */
const inflight = new Map<string, { promise: Promise<BuildOutcome>; jobId: string }>();
/** 진행 중인 공유 작업의 자기 신호들. 종료 때 한꺼번에 취소한다. 작업이 끝나면 지운다. */
const controllers = new Set<AbortController>();
/** 최근 실패: 키 = 인덱스 키, 성공하면 지운다. 실패 직후 질의마다 클론을 되풀이하지 않도록 60초 동안은 같은 오류를 바로 돌려준다. */
const failures = new Map<string, { at: number; message: string }>();
const backoffMs = 60_000;

const recentFailure = (key: string): string | undefined => {
  const failure = failures.get(key);
  return failure !== undefined && Date.now() - failure.at < backoffMs ? failure.message : undefined;
};

/** 진행 중인 모든 공유 빌드를 취소한다(프로세스 종료). 빌드 스레드는 풀이 끝낸다. */
export function abortSharedBuilds(): void {
  for (const controller of controllers) controller.abort(Object.assign(new Error("shutting down"), { name: "AbortError" }));
}
onShutdown(async () => abortSharedBuilds());

/**
 * 인덱스를 만든다(이미 만드는 중이면 그 작업을 돌려준다). 이 약속에는 요청 신호가 없다.
 * 질의가 기다리게 된 작업이 대기 중인 background 면 foreground 로 올린다(갱신 때문에 질의가 밀리지 않게).
 */
export function ensureIndex(dataDir: string, config: CodebaseConfig, deps: BuildDeps, priority: BuildPriority): Promise<BuildOutcome> {
  const key = keyOf(config);
  const running = inflight.get(key);
  if (running !== undefined) {
    if (priority === "foreground") (deps.buildPool ?? buildPool()).promote(running.jobId);
    return running.promise;
  }
  const jobId = randomUUID();
  const controller = new AbortController();
  controllers.add(controller);
  const promise = (async () => {
    try {
      const outcome = await buildFor(dataDir, config, { ...deps, signal: undefined }, { signal: controller.signal, priority, jobId });
      failures.delete(key);
      return outcome;
    } catch (error) {
      if (!isAbort(error)) failures.set(key, { at: Date.now(), message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      inflight.delete(key);
      controllers.delete(controller);
    }
  })();
  inflight.set(key, { promise, jobId });
  return promise;
}

/** 이 설정의 인덱스가 디스크에 있는가(만들지 않고 파싱하지도 않는다: `stat` 만). */
export async function hasIndex(dataDir: string, config: CodebaseConfig): Promise<boolean> {
  return indexExists(dataDir, keyOf(config));
}

/** 질의에 대한 인덱스 안의 답: 검색 스레드가 돌려준 topK 자료와 점수(자료와 같은 순서), 인덱스를 만든 시각. */
export type IndexAnswer = { materials: Material[]; scores: number[]; builtAt: string };

/**
 * 질의에 답한다. 인덱스는 검색 스레드가 읽고 파싱하고 검색기를 캐시하며, 메인에는 topK 자료만 온다.
 * 인덱스가 없으면 만들어 기다리고(시간 상한 있음, 요청이 취소되면 기다림만 그만둔다), 오래됐으면(refreshHours) 옛 인덱스로 답하며 뒤에서 갱신한다.
 */
export async function queryIndex(dataDir: string, config: CodebaseConfig, query: string, deps: BuildDeps = {}): Promise<IndexAnswer> {
  const key = keyOf(config);
  const file = indexPath(dataDir, key);
  const pool = deps.searchPool ?? searchPool();
  // 색인 캐시 키는 파일 경로다: 데이터 폴더가 다르면 같은 설정이어도 다른 색인이다.
  const ask = () => pool.search({ file, cacheKey: file, query, topK: config.topK }, { signal: deps.signal });

  let outcome = await ask();
  if (outcome.type === "absent") {
    const failure = recentFailure(key);
    if (failure !== undefined) throw new Error(failure);
    await raceAbort(ensureIndex(dataDir, config, deps, "foreground"), deps.signal);
    outcome = await ask();
    if (outcome.type === "absent") throw new Error(`index could not be read after build (${outcome.reason})`);
  } else if (isStale(outcome, config.refreshHours) && !inflight.has(key) && recentFailure(key) === undefined) {
    ensureIndex(dataDir, config, deps, "background").catch((error: unknown) => {
      if (!isAbort(error)) console.error(`codebase refresh failed: ${error instanceof Error ? error.message : "unknown"}`);
    });
  }
  return { materials: outcome.materials, scores: outcome.scores, builtAt: outcome.builtAt };
}
