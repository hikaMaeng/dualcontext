import type { CodeIndex } from "../model/index.js";
import { tokenize } from "./tokenize.js";

export type Hit = { id: number; score: number; /** 어휘 일치가 아니라 호출 관계로 끌려온 경우 그 출발 심볼 */ via?: number };

export type Searcher = { postings: Map<string, Map<number, number>>; lengths: number[]; average: number };

/** 협력적 취소 확인: true 면 지금 하던 구축 · 검색을 멈춘다. 검색 스레드는 공유 취소 플래그를 읽어 이 함수를 만든다. */
export type StopCheck = () => boolean;

/** 취소로 멈췄다는 표식. 이름이 `AbortError` 라 수집기의 `isAbort` 가 취소로 알아본다. */
export class SearchCancelled extends Error {
  override name = "AbortError";
  constructor() {
    super("search cancelled");
  }
}

const k1 = 1.2;
const b = 0.75;
/** 이름 · 경로 · 본문 가중치: 이름이 맞는 것이 본문에 우연히 나온 것보다 훨씬 강한 신호다. */
const weights = { name: 4, path: 1.5, body: 1 };
/** 어휘로 찾은 심볼의 점수 중 이웃(호출하는 / 호출되는 심볼)에 나눠 주는 비율. */
const neighborShare = 0.35;
/** 취소 플래그를 읽는 간격(심볼 · 후보 수). 너무 잦으면 느리고 너무 드물면 취소가 늦다. */
const stopEvery = 256;

/**
 * 검색기(역색인)를 만든다. 심볼 `stopEvery` 개마다 취소를 확인한다(큰 색인의 cold 구축이 스레드를 오래 붙잡지 않게).
 * 복잡도 O(색인의 모든 토큰).
 */
export function buildSearcher(index: CodeIndex, shouldStop: StopCheck = () => false): Searcher {
  const postings = new Map<string, Map<number, number>>();
  const lengths: number[] = [];
  for (const [position, symbol] of index.symbols.entries()) {
    if (position % stopEvery === 0 && shouldStop()) throw new SearchCancelled();
    const counts = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const token of tokenize(text)) counts.set(token, (counts.get(token) ?? 0) + weight);
    };
    add(symbol.name, weights.name);
    add((index.files[symbol.file] as { path: string }).path, weights.path);
    add(symbol.snippet, weights.body);
    let length = 0;
    for (const [token, count] of counts) {
      length += count;
      const posting = postings.get(token) ?? new Map<number, number>();
      posting.set(symbol.id, count);
      postings.set(token, posting);
    }
    lengths.push(length);
  }
  return { postings, lengths, average: lengths.reduce((sum, value) => sum + value, 0) / Math.max(1, lengths.length) };
}

/** 검색기 캐시(스레드 밖 단독 사용): 키 = 인덱스 빌드 시각 + 출처 라벨, 상한 8개(가장 오래된 것부터 버림). 검색 스레드는 이 캐시 대신 바이트 예산 LRU 를 쓴다. */
const cache = new Map<string, Searcher>();
const cacheLimit = 8;

function searcherOf(index: CodeIndex): Searcher {
  const key = `${index.builtAt}|${index.source.label}|${index.source.subPath ?? ""}`;
  let searcher = cache.get(key);
  if (searcher === undefined) {
    searcher = buildSearcher(index);
    cache.set(key, searcher);
    if (cache.size > cacheLimit) cache.delete(cache.keys().next().value as string);
  }
  return searcher;
}

/**
 * 질의에 맞는 심볼 topK 개. 1) BM25 로 어휘(이름 · 경로 · 본문) 일치 순위를 매기고,
 * 2) 상위 일치 심볼의 호출 관계 이웃(호출하는 쪽 · 호출되는 쪽)에 점수 일부를 나눠 줘 구조상 가까운 심볼을 끌어올린다.
 * 질의에서 영문 토큰이 하나도 안 나오면 빈 결과다.
 */
export function search(index: CodeIndex, query: string, topK: number): Hit[] {
  if (index.symbols.length === 0 || tokenize(query, true).length === 0) return [];
  return searchWith(index, searcherOf(index), query, topK);
}

/** 이미 만든 검색기로 검색한다. 용어마다 · 용어 안에서 `stopEvery` 개 후보마다 취소를 확인한다. */
export function searchWith(index: CodeIndex, searcher: Searcher, query: string, topK: number, shouldStop: StopCheck = () => false): Hit[] {
  const terms = [...new Set(tokenize(query, true))];
  if (terms.length === 0 || index.symbols.length === 0) return [];
  const { postings, lengths, average } = searcher;
  const total = index.symbols.length;

  const scores = new Map<number, number>();
  for (const term of terms) {
    if (shouldStop()) throw new SearchCancelled();
    const posting = postings.get(term);
    if (posting === undefined) continue;
    const idf = Math.log(1 + (total - posting.size + 0.5) / (posting.size + 0.5));
    let visited = 0;
    for (const [id, tf] of posting) {
      if (++visited % (stopEvery * 16) === 0 && shouldStop()) throw new SearchCancelled();
      const norm = tf + k1 * (1 - b + (b * (lengths[id] as number)) / Math.max(1, average));
      scores.set(id, (scores.get(id) ?? 0) + (idf * tf * (k1 + 1)) / norm);
    }
  }
  if (scores.size === 0) return [];

  const lexical = [...scores].sort((a, c) => c[1] - a[1]).slice(0, topK * 3);
  const finalScores = new Map<number, Hit>(lexical.map(([id, score]) => [id, { id, score }]));
  for (const [id, score] of lexical) {
    const symbol = index.symbols[id];
    if (symbol === undefined) continue;
    for (const neighbor of [...symbol.calls, ...symbol.calledBy]) {
      const bonus = score * neighborShare;
      const current = finalScores.get(neighbor);
      if (current === undefined) finalScores.set(neighbor, { id: neighbor, score: bonus, via: id });
      else current.score += bonus;
    }
  }
  return [...finalScores.values()].sort((a, c) => c.score - a.score).slice(0, topK);
}
