import type pg from "pg";
import type { Material } from "dualcontext_domain/common";
import type { ModelClient } from "../../model/index.js";
import { createWalkDeps } from "./client/index.js";
import { crawlFingerprint, parseCrawlerConfig, type CrawlerConfig } from "./config/index.js";
import { discardIfFingerprintChanged, embedPending, markFailed, markRunning, readState, replacePages, searchChunks, type CrawlState } from "./store/index.js";
import { walk, type WalkDeps } from "./walk/index.js";

/**
 * 진행 중인 크롤: 조사원 id → 약속. 같은 조사원의 크롤을 한 번에 하나로 제한한다(질의가 겹쳐도 크롤이 겹치지 않는다).
 * 키는 researchers.id(유일), 수명은 크롤 한 번(끝나면 finally 에서 지움), 크기는 조사원 수 이하다.
 */
const inFlight = new Map<number, Promise<void>>();

export type CrawlerDeps = { walkDeps?: WalkDeps; log?: (message: string) => void };

/** 크롤 한 번: 대상이 바뀌었으면 캐시 폐기 → 크롤 → 색인 → 임베딩. 이미 돌고 있으면 그 약속을 그대로 돌려준다. */
export function runCrawl(pool: pg.Pool, model: ModelClient, researcherId: number, config: CrawlerConfig, deps: CrawlerDeps = {}): Promise<void> {
  const running = inFlight.get(researcherId);
  if (running) return running;
  const job = (async () => {
    const fingerprint = crawlFingerprint(config);
    await discardIfFingerprintChanged(pool, researcherId, fingerprint);
    await markRunning(pool, researcherId, fingerprint);
    try {
      const result = await walk(config, deps.walkDeps ?? createWalkDeps());
      if (result.pages.length === 0) {
        const reasons = result.skipped.slice(0, 3).map((entry) => `${entry.url}: ${entry.reason}`).join("; ");
        throw new Error(`crawl produced no pages${reasons ? ` (${reasons})` : ""}`);
      }
      const stored = await replacePages(pool, researcherId, config, result.pages);
      deps.log?.(`crawler ${researcherId}: ${stored.pages} pages, ${stored.chunks} chunks, ${result.skipped.length} skipped${result.truncated ? ", truncated" : ""}`);
      await embedPending(pool, model, researcherId);
    } catch (error) {
      await markFailed(pool, researcherId, (error as Error).message);
      throw error;
    }
  })().finally(() => inFlight.delete(researcherId));
  inFlight.set(researcherId, job);
  return job;
}

/** 캐시가 갱신 주기를 넘겼는가. 한 번도 끝난 적이 없으면 true. */
export function isStale(state: CrawlState | null, config: CrawlerConfig, now: number): boolean {
  return state === null || state.finishedAt === null || now - new Date(state.finishedAt).getTime() > config.refreshHours * 3_600_000;
}

/**
 * 크롤러 조사원: 지정한 사이트를 크롤해 청크로 나눠 임베딩해 두고, 질의와 가까운 조각을 돌려준다.
 * - 캐시가 없거나 크롤 대상 설정이 바뀌었으면 이 호출 안에서 먼저 크롤한다(maxCrawlSeconds 까지 기다린다).
 * - 캐시가 있으면 곧바로 답하고, 갱신 주기(refreshHours)를 넘겼으면 백그라운드로 다시 크롤한다(오래된 캐시로 먼저 답한다).
 */
export async function collectCrawler(pool: pg.Pool, model: ModelClient, researcherId: number, rawConfig: Record<string, unknown>, query: string, deps: CrawlerDeps = {}): Promise<Material[]> {
  const config = parseCrawlerConfig(rawConfig);
  const state = await readState(pool, researcherId);
  const usable = state !== null && state.fingerprint === crawlFingerprint(config) && state.chunks > 0;
  if (!usable) await runCrawl(pool, model, researcherId, config, deps);
  else if (isStale(state, config, Date.now()) && !inFlight.has(researcherId)) {
    void runCrawl(pool, model, researcherId, config, deps).catch((error) => console.error(`crawler ${researcherId} refresh failed: ${(error as Error).message}`));
  }
  await embedPending(pool, model, researcherId);
  const hits = await searchChunks(pool, model, researcherId, config, query);
  return hits.map((hit) => ({ title: `${hit.title || hit.url} (${hit.url})`, text: hit.text, score: Number(hit.score.toFixed(4)) }));
}

/** 관리자의 「지금 크롤」: 백그라운드로 시작하고 바로 돌려준다. 진행은 crawlStatus 로 본다. */
export async function startCrawl(pool: pg.Pool, model: ModelClient, researcherId: number, rawConfig: Record<string, unknown>): Promise<void> {
  const config = parseCrawlerConfig(rawConfig);
  void runCrawl(pool, model, researcherId, config).catch((error) => console.error(`crawler ${researcherId} failed: ${(error as Error).message}`));
}

export async function crawlStatus(pool: pg.Pool, researcherId: number): Promise<CrawlState & { running: boolean }> {
  const state = (await readState(pool, researcherId)) ?? { fingerprint: "", status: "idle" as const, startedAt: null, finishedAt: null, pages: 0, chunks: 0, error: null };
  const running = inFlight.has(researcherId);
  // 서버가 재시작되면 진행 중이던 크롤은 사라진다. 이 프로세스가 모르는 'running' 은 중단된 것으로 본다.
  return state.status === "running" && !running ? { ...state, status: "error", error: "interrupted", running } : { ...state, running };
}
