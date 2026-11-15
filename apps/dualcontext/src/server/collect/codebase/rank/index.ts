import type { CodeIndex } from "../model/index.js";
import { tokenize } from "./tokenize.js";

export type Hit = { id: number; score: number; /** 어휘 일치가 아니라 호출 관계로 끌려온 경우 그 출발 심볼 */ via?: number };

type Searcher = { postings: Map<string, Map<number, number>>; lengths: number[]; average: number };

const k1 = 1.2;
const b = 0.75;
/** 이름 · 경로 · 본문 가중치: 이름이 맞는 것이 본문에 우연히 나온 것보다 훨씬 강한 신호다. */
const weights = { name: 4, path: 1.5, body: 1 };
/** 어휘로 찾은 심볼의 점수 중 이웃(호출하는 / 호출되는 심볼)에 나눠 주는 비율. */
const neighborShare = 0.35;
/** 검색기 캐시: 키 = 인덱스 빌드 시각 + 출처 라벨, 상한 8개(가장 오래된 것부터 버림), 인덱스가 다시 만들어지면 키가 달라져 자연히 밀려난다. */
const cache = new Map<string, Searcher>();
const cacheLimit = 8;

function build(index: CodeIndex): Searcher {
  const postings = new Map<string, Map<number, number>>();
  const lengths: number[] = [];
  for (const symbol of index.symbols) {
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

function searcherOf(index: CodeIndex): Searcher {
  const key = `${index.builtAt}|${index.source.label}|${index.source.subPath ?? ""}`;
  let searcher = cache.get(key);
  if (searcher === undefined) {
    searcher = build(index);
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
  const terms = [...new Set(tokenize(query, true))];
  if (terms.length === 0 || index.symbols.length === 0) return [];
  const { postings, lengths, average } = searcherOf(index);
  const total = index.symbols.length;

  const scores = new Map<number, number>();
  for (const term of terms) {
    const posting = postings.get(term);
    if (posting === undefined) continue;
    const idf = Math.log(1 + (total - posting.size + 0.5) / (posting.size + 0.5));
    for (const [id, tf] of posting) {
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
