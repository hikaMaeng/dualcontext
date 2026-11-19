import { open } from "node:fs/promises";
import { toMaterials } from "../../collect/codebase/format/index.js";
import type { CodeIndex } from "../../collect/codebase/model/index.js";
import { buildSearcher, searchWith, SearchCancelled, type Searcher } from "../../collect/codebase/rank/index.js";
import { indexGeneration, maxIndexBytes, parseIndex } from "../../collect/codebase/store/index.js";
import type { SearchReply, SearchRequest } from "./protocol.js";

/** 캐시 항목의 메모리 추정: 색인 파일 바이트 × 4(파싱한 객체 + 검색기). 정확한 값이 아니라 예산 계산용이다. */
export const bytesFactor = 4;

type Entry = { generation: string; builtAt: string; index: CodeIndex; searcher: Searcher; bytes: number };

/**
 * 검색 스레드가 소유하는 색인 캐시 + 검색 실행. 스레드 안에서 돌지만 순수하게 만들어 메인 스레드에서도 시험할 수 있다.
 * 캐시: 키 = 색인 키(스레드가 키 해시로 고정되므로 키 집합이 스레드마다 다르다), 범위 = 스레드, 크기 = 바이트 예산(색인 수가 아니다),
 * 비우는 쪽 = 이 캐시(가장 오래 안 쓴 것부터, 단 방금 넣은 항목 하나는 예산을 넘어도 남긴다).
 * 무효화: 질의마다 파일 `stat` 의 세대(`mtimeMs:size:ino`)를 비교하고, 달라졌으면 다시 읽어 파싱한 `builtAt` 과 함께 새 항목으로 바꾼다.
 */
export function createEngine(options: { budgetBytes: number }) {
  const cache = new Map<string, Entry>();
  let total = 0;

  const touch = (key: string, entry: Entry) => {
    cache.delete(key);
    cache.set(key, entry);
  };
  const drop = (key: string) => {
    const old = cache.get(key);
    if (old !== undefined) total -= old.bytes;
    cache.delete(key);
  };
  const admit = (key: string, entry: Entry) => {
    drop(key);
    cache.set(key, entry);
    total += entry.bytes;
    for (const oldest of cache.keys()) {
      if (total <= options.budgetBytes || cache.size <= 1) break;
      if (oldest !== key) drop(oldest);
    }
  };

  async function run(request: SearchRequest, flag: Int32Array): Promise<SearchReply> {
    const stop = () => Atomics.load(flag, 0) !== 0;
    const cancelled = (): SearchReply => ({ id: request.id, type: "cancelled" });
    try {
      if (stop()) return cancelled();
      const info = await indexGeneration(request.file);
      if (info === null) {
        drop(request.cacheKey);
        return { id: request.id, type: "absent", reason: "missing" };
      }
      if (info.size > maxIndexBytes) {
        drop(request.cacheKey);
        return { id: request.id, type: "absent", reason: "too-large" };
      }

      let entry = cache.get(request.cacheKey);
      let readMs = 0;
      let buildMs = 0;
      const warm = entry !== undefined && entry.generation === info.generation;
      if (warm && entry !== undefined) touch(request.cacheKey, entry);
      else {
        const readStarted = performance.now();
        // 열린 핸들의 stat 과 내용은 같은 파일이다(읽는 중 원자적 교체가 있어도 세대와 내용이 어긋나지 않는다).
        const handle = await open(request.file, "r");
        let text: string;
        let generation: string;
        try {
          const opened = await handle.stat();
          if (opened.size > maxIndexBytes) {
            drop(request.cacheKey);
            return { id: request.id, type: "absent", reason: "too-large" };
          }
          generation = `${opened.mtimeMs}:${opened.size}:${opened.ino}`;
          text = await handle.readFile("utf8");
        } finally {
          await handle.close();
        }
        if (stop()) return cancelled();
        const index = parseIndex(text);
        readMs = performance.now() - readStarted;
        if (index === null) {
          drop(request.cacheKey);
          return { id: request.id, type: "absent", reason: "invalid" };
        }
        if (stop()) return cancelled();
        const buildStarted = performance.now();
        const searcher = buildSearcher(index, stop);
        buildMs = performance.now() - buildStarted;
        entry = { generation, builtAt: index.builtAt, index, searcher, bytes: Buffer.byteLength(text) * bytesFactor };
        admit(request.cacheKey, entry);
      }

      const searchStarted = performance.now();
      const hits = searchWith(entry.index, entry.searcher, request.query, request.topK, stop);
      return {
        id: request.id,
        type: "found",
        builtAt: entry.builtAt,
        materials: toMaterials(entry.index, hits),
        scores: hits.map((hit) => hit.score),
        stats: { warm, readMs, buildMs, searchMs: performance.now() - searchStarted, fileBytes: info.size }
      };
    } catch (error) {
      if (error instanceof SearchCancelled) return cancelled();
      return { id: request.id, type: "failed", message: error instanceof Error ? error.message : String(error) };
    }
  }

  return { run, stats: () => ({ entries: cache.size, bytes: total }) };
}
