import type pg from "pg";
import type { Material } from "dualcontext_domain/common";
import { onShutdown } from "../../workers/pool/index.js";
import { isAbort, raceAbort } from "../abort/index.js";
import { createWalkDeps } from "./client/index.js";
import { crawlFingerprint, parseCrawlerConfig, type CrawlerConfig } from "./config/index.js";
import { pinEmbedder, type EmbeddingPort } from "./embedding/index.js";
import { discardIfFingerprintChanged, embedPending, markFailed, markRunning, readState, replacePages, searchChunks, type CrawlState } from "./store/index.js";
import { walk, type WalkDeps } from "./walk/index.js";

/**
 * 진행 중인 크롤: 조사원 id → 약속. 같은 조사원의 크롤을 한 번에 하나로 제한한다(질의가 겹쳐도 크롤이 겹치지 않는다).
 * 키는 researchers.id(유일), 수명은 크롤 한 번(끝나면 finally 에서 지움), 크기는 조사원 수 이하다.
 * 크롤은 공유 작업이라 요청의 취소 신호로 죽지 않는다: 요청은 기다림에서만 떨어지고(`raceAbort`), 크롤은 자기 신호(`controllers`)만 따른다.
 */
const inFlight = new Map<number, Promise<void>>();
/** 진행 중인 크롤 자신의 신호들(키 = 조사원 id, 크롤이 끝나면 지운다). 프로세스 종료 때 한꺼번에 취소한다. */
const controllers = new Map<number, AbortController>();
/** 최근 크롤 실패(키 = 조사원 id, 크롤이 성공하면 지운다). 첫 실패 뒤 60초 동안은 질의가 크롤을 되풀이하지 않고 같은 오류를 바로 돌려준다. */
const failures = new Map<number, { at: number; message: string }>();
const backoffMs = 60_000;

const recentFailure = (researcherId: number, now: number = Date.now()): string | undefined => {
  const failure = failures.get(researcherId);
  return failure !== undefined && now - failure.at < backoffMs ? failure.message : undefined;
};

/** 진행 중인 모든 크롤을 취소한다(프로세스 종료). */
export function abortSharedCrawls(): void {
  for (const controller of controllers.values()) controller.abort(Object.assign(new Error("shutting down"), { name: "AbortError" }));
}
onShutdown(async () => abortSharedCrawls());

/** `signal` 은 이 호출을 요청한 쪽의 신호이며 크롤 자체에는 쓰이지 않는다(공유 작업). */
export type CrawlerDeps = { walkDeps?: WalkDeps; log?: (message: string) => void; signal?: AbortSignal };

/**
 * 크롤 한 번: 대상이 바뀌었으면 캐시 폐기 → 크롤 → 색인 → 임베딩 백필. 이미 돌고 있으면 그 약속을 그대로 돌려준다.
 * 임베딩은 이 작업이 시작한 뒤 **한 번 읽어 고정한 설정**으로 끝까지 채운다(`pinEmbedder`).
 */
export function runCrawl(pool: pg.Pool, model: EmbeddingPort, researcherId: number, config: CrawlerConfig, deps: CrawlerDeps = {}): Promise<void> {
  const running = inFlight.get(researcherId);
  if (running) return running;
  const controller = new AbortController();
  controllers.set(researcherId, controller);
  const job = (async () => {
    const fingerprint = crawlFingerprint(config);
    await discardIfFingerprintChanged(pool, researcherId, fingerprint);
    await markRunning(pool, researcherId, fingerprint);
    try {
      const result = await walk(config, deps.walkDeps ?? createWalkDeps(), controller.signal);
      if (result.pages.length === 0) {
        const reasons = result.skipped.slice(0, 3).map((entry) => `${entry.url}: ${entry.reason}`).join("; ");
        throw new Error(`crawl produced no pages${reasons ? ` (${reasons})` : ""}`);
      }
      const stored = await replacePages(pool, researcherId, config, result.pages);
      deps.log?.(`crawler ${researcherId}: ${stored.pages} pages, ${stored.chunks} chunks, ${result.skipped.length} skipped${result.truncated ? ", truncated" : ""}`);
      await embedPending(pool, await pinEmbedder(model), researcherId);
      failures.delete(researcherId);
    } catch (error) {
      const message = (error as Error).message;
      if (!isAbort(error)) failures.set(researcherId, { at: Date.now(), message });
      await markFailed(pool, researcherId, message);
      throw error;
    }
  })().finally(() => {
    inFlight.delete(researcherId);
    controllers.delete(researcherId);
  });
  inFlight.set(researcherId, job);
  return job;
}

/** 캐시가 갱신 주기를 넘겼는가. 한 번도 끝난 적이 없으면 true. */
export function isStale(state: CrawlState | null, config: CrawlerConfig, now: number): boolean {
  return state === null || state.finishedAt === null || now - new Date(state.finishedAt).getTime() > config.refreshHours * 3_600_000;
}

/**
 * 크롤러 조사원: 지정한 사이트를 크롤해 청크로 나눠 임베딩해 두고, 질의와 가까운 조각을 돌려준다.
 * - 캐시가 없거나 크롤 대상 설정이 바뀌었으면 이 호출 안에서 먼저 크롤한다(maxCrawlSeconds 까지 기다린다). 직전 크롤이 실패했으면 60초 동안은 다시 크롤하지 않고 같은 오류를 돌려준다.
 * - 캐시가 있으면 곧바로 답하고, 갱신 주기(refreshHours)를 넘겼으면 백그라운드로 다시 크롤한다(오래된 캐시로 먼저 답한다).
 * - 임베딩 백필과 질의 벡터는 같은 고정 설정을 쓴다. 코사인 순위는 DB 가 계산한다(`store/search.ts`).
 * `deps.signal`(요청 취소)은 기다림만 끝낸다: 크롤 · 백필은 다른 요청도 기다리는 공유 작업이라 죽이지 않는다.
 */
export async function collectCrawler(pool: pg.Pool, model: EmbeddingPort, researcherId: number, rawConfig: Record<string, unknown>, query: string, deps: CrawlerDeps = {}): Promise<Material[]> {
  const { signal } = deps;
  const config = parseCrawlerConfig(rawConfig);
  const state = await raceAbort(readState(pool, researcherId), signal);
  const usable = state !== null && state.fingerprint === crawlFingerprint(config) && state.chunks > 0;
  if (!usable) {
    const failure = recentFailure(researcherId);
    if (failure !== undefined) throw new Error(failure);
    await raceAbort(runCrawl(pool, model, researcherId, config, deps), signal);
  } else if (isStale(state, config, Date.now()) && !inFlight.has(researcherId) && recentFailure(researcherId) === undefined) {
    void runCrawl(pool, model, researcherId, config, deps).catch((error) => {
      if (!isAbort(error)) console.error(`crawler ${researcherId} refresh failed: ${(error as Error).message}`);
    });
  }
  const embedder = await raceAbort(pinEmbedder(model), signal);
  await raceAbort(embedPending(pool, embedder, researcherId), signal);
  const hits = await searchChunks(pool, embedder, researcherId, config, query, signal);
  return hits.map((hit) => ({ title: `${hit.title || hit.url} (${hit.url})`, text: hit.text, score: Number(hit.score.toFixed(4)) }));
}

/** 관리자의 「지금 크롤」: 백그라운드로 시작하고 바로 돌려준다. 진행은 crawlStatus 로 본다. 직전 실패의 백오프는 무시한다(사람이 다시 시도하는 것이다). */
export async function startCrawl(pool: pg.Pool, model: EmbeddingPort, researcherId: number, rawConfig: Record<string, unknown>): Promise<void> {
  const config = parseCrawlerConfig(rawConfig);
  void runCrawl(pool, model, researcherId, config).catch((error) => {
    if (!isAbort(error)) console.error(`crawler ${researcherId} failed: ${(error as Error).message}`);
  });
}

export async function crawlStatus(pool: pg.Pool, researcherId: number): Promise<CrawlState & { running: boolean }> {
  const state = (await readState(pool, researcherId)) ?? { fingerprint: "", status: "idle" as const, startedAt: null, finishedAt: null, pages: 0, chunks: 0, error: null };
  const running = inFlight.has(researcherId);
  // 서버가 재시작되면 진행 중이던 크롤은 사라진다. 이 프로세스가 모르는 'running' 은 중단된 것으로 본다.
  return state.status === "running" && !running ? { ...state, status: "error", error: "interrupted", running } : { ...state, running };
}
