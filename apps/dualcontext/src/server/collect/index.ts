import type pg from "pg";
import type { Material, Researcher } from "dualcontext_domain/common";
import type { ModelClient } from "../model/index.js";
import { raceAbort } from "./abort/index.js";
import { collectCodebase } from "./codebase/index.js";
import { collectCrawler } from "./crawler/index.js";
import { collectDuckDuckGo } from "./duckduckgo/index.js";
import { webSearchQuery } from "./duckduckgo/rewrite/index.js";
import { collectFolder } from "./folder/index.js";
import { collectPgvector } from "./pgvector/index.js";
import type { CollectKind, CollectQueues } from "./queues/index.js";

/**
 * 조사원 타입에 맞는 수집기로 보낸다. 새 타입은 collect/<type>/ 폴더를 더하고 여기에 한 줄을 추가한다.
 * `signal` 은 이 실행의 취소 신호다: 수집기는 `fetch` 에 넘기고, 파일 · 스캔 루프는 파일 사이에서 확인하며, 취소할 수 없는 대기(DB 쿼리 ·
 * 공유 작업)는 `raceAbort` 로 이 분기만 즉시 끝낸다. 취소는 일반 실패로 삼키지 않고 그대로 던진다(`collect/abort`).
 */
export type CollectOptions = {
  signal?: AbortSignal;
  /** 있으면 모든 수집이 종류별 작업 큐를 거친다(부하의 상한 = 종류별 소비자 수). 없으면(시험 · 단독 호출) 바로 실행한다. */
  queues?: CollectQueues;
  /** 큐의 공정성 단위(실행). */
  runKey?: string;
};

export function collect(pool: pg.Pool, model: ModelClient, dataDir: string, researcher: Researcher, query: string, options: CollectOptions = {}): Promise<Material[]> {
  const { queues, runKey } = options;
  // 큐를 거치면 작업이 받는 신호가 취소 신호(큐에서 빠지거나 실행 중이면 abort)다. 거치지 않으면 실행의 신호를 그대로 쓴다.
  const queued = <T>(kind: CollectKind, work: (signal: AbortSignal | undefined) => Promise<T>): Promise<T> =>
    queues
      ? queues.run(kind, work, { ...(runKey !== undefined ? { runKey } : {}), ...(options.signal ? { signal: options.signal } : {}) })
      : work(options.signal);
  switch (researcher.type) {
    case "duckduckgo":
      return collectWeb(model, researcher.config, query, (searched) => queued("web", (signal) => collectDuckDuckGo(researcher.config, searched, signal)));
    case "pgvector":
      // 질의 임베딩(추론 서버 호출)은 store 큐 밖에서 임베딩 큐로 병렬 처리하고, DB 조회만 store 큐(한 번에 하나)에서 돈다.
      return raceAbort(model.embed([query]), options.signal).then(([vector]) => queued("store", (signal) => collectPgvector(pool, model, researcher.config, query, signal, vector)));
    case "folder":
      return queued("store", (signal) => collectFolder(pool, dataDir, researcher.config, query, signal));
    case "codebase":
      return queued("codebase", (signal) => collectCodebase(dataDir, researcher.config, query, { signal }));
    case "crawler":
      return queued("crawl", (signal) => collectCrawler(pool, model, researcher.id, researcher.config, query, { signal }));
  }
}

/**
 * 웹 검색: 질의 원문 대신 모델이 웹 검색어로 다시 쓴 문장을 보낸다(config.rewrite 가 false 면 원문).
 * 쓴 검색어가 원문과 다르면 첫 자료 본문 앞에 남겨, 실행 상세에서 무엇을 검색했는지 보이게 한다.
 * 검색어 재작성(모델 큐)은 웹 큐 밖에서 끝내고, `search` 로 외부 요청 하나만 웹 큐에 넣는다.
 */
async function collectWeb(model: ModelClient, config: Record<string, unknown>, query: string, search: (searched: string) => Promise<Material[]>): Promise<Material[]> {
  const searched = config.rewrite === false ? query : await webSearchQuery((prompt) => model.chat(prompt), query);
  const materials = await search(searched);
  const first = materials[0];
  if (first !== undefined && searched !== query) materials[0] = { ...first, text: `(검색어: ${searched}) ${first.text}` };
  return materials;
}
