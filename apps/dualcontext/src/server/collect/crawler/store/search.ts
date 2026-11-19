import type pg from "pg";
import { raceAbort } from "../../abort/index.js";
import { withStatementTimeout } from "../../timeout/index.js";
import type { CrawlerConfig } from "../config/index.js";
import { assertVector, vectorLiteral, type PinnedEmbedder } from "../embedding/index.js";

/** `idx` 는 순위 기준 구현(`rankHits`)의 동점 정렬용이다(SQL 은 정렬에만 쓰고 돌려주지 않는다). */
export type Hit = { url: string; title: string; text: string; score: number; idx?: number };

/** 검색 쿼리 시한(ms). 체크아웃한 연결에서 `SET LOCAL statement_timeout` 으로 건다(세션 전체가 아니다). */
export const searchTimeoutMs = 30_000;

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** 순위 매기기만 하는 순수 함수: 점수 미달 제거, 페이지당 perPage 개 제한, 상위 topK. SQL 순위(`searchSql`)의 기준 구현이다. */
export function rankHits(hits: Hit[], config: Pick<CrawlerConfig, "minScore" | "perPage" | "topK">): Hit[] {
  const perPage = new Map<string, number>();
  const out: Hit[] = [];
  for (const hit of [...hits].sort((a, b) => b.score - a.score || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0) || (a.idx ?? 0) - (b.idx ?? 0))) {
    if (hit.score < config.minScore) break;
    const used = perPage.get(hit.url) ?? 0;
    if (used >= config.perPage) continue;
    perPage.set(hit.url, used + 1);
    out.push(hit);
    if (out.length >= config.topK) break;
  }
  return out;
}

/**
 * 코사인 유사도 검색 SQL(DB 에서 계산한다: JS 에서 3000×차원 배열을 훑지 않는다).
 * 파라미터: $1 조사원 id, $2 임베딩 키, $3 질의 차원, $4 질의 벡터 `[a,b,c]`, $5 minScore, $6 perPage, $7 topK.
 *
 * - `c` 는 `materialized`: 차원 · NULL · 비유한 원소 조건이 `::vector` 캐스트보다 **먼저** 평가되게 한다
 *   (차원이 다르거나 NaN 이 든 옛 행이 캐스트 오류로 쿼리 전체를 죽이지 않고 제외된다).
 * - 점수 = `1 - (embedding <=> query)`. 양쪽 영벡터 · NaN 이면 0(옛 JS `cosine` 의 의미).
 * - 순위: `score >= minScore` → 페이지별 `row_number() <= perPage`(점수 내림, idx) → 점수 내림 · url · idx 로 topK.
 *   동점은 `url, idx` 로 결정적으로 정렬한다.
 */
export const searchSql = `with c as materialized (
  select c.url, p.title, c.text, c.idx, c.embedding
    from crawl_chunks c
    join crawl_pages p using (researcher_id, url)
   where c.researcher_id = $1
     and c.embedding_key = $2
     and c.embedding is not null
     and array_length(c.embedding, 1) = $3
     and array_position(c.embedding, null::double precision) is null
     and not (c.embedding && array['NaN', 'Infinity', '-Infinity']::double precision[])
), s as (
  select c.url, c.title, c.text, c.idx,
         case when d.v is null or d.v = 'NaN'::double precision then 0::double precision else 1 - d.v end as score
    from c
    cross join lateral (select c.embedding::vector <=> $4::text::vector as v) d
), r as (
  select s.*, row_number() over (partition by s.url order by s.score desc, s.idx) as rn
    from s
   where s.score >= $5
)
select r.url, r.title, r.text, r.score
  from r
 where r.rn <= $6
 order by r.score desc, r.url, r.idx
 limit $7`;

/** `searchSql` 의 파라미터를 조립한다(질의 벡터 검증 포함). */
export function searchParams(researcherId: number, key: string, vector: number[], config: Pick<CrawlerConfig, "minScore" | "perPage" | "topK">): unknown[] {
  assertVector(vector, "query embedding");
  return [researcherId, key, vector.length, vectorLiteral(vector), config.minScore, config.perPage, config.topK];
}

/**
 * 질의 임베딩과 같은 설정(`embedder`, 작업 시작 때 고정)으로 만든 청크 임베딩의 코사인 유사도로 순위를 매긴다.
 * 계산은 DB 가 한다. 취소 신호는 기다림만 끝낸다(`raceAbort`): 이미 나간 쿼리는 시한(30초) 안에 끝난다.
 */
export async function searchChunks(pool: pg.Pool, embedder: PinnedEmbedder, researcherId: number, config: CrawlerConfig, query: string, signal?: AbortSignal): Promise<Hit[]> {
  const [queryVector] = await raceAbort(embedder.embed([query]), signal);
  const params = searchParams(researcherId, embedder.key, queryVector as number[], config);
  const { rows } = await raceAbort(withStatementTimeout(pool, (client) => client.query<Hit>(searchSql, params), searchTimeoutMs), signal);
  return rows.map((row) => ({ url: row.url, title: row.title, text: row.text, score: Number(row.score) }));
}
