import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { withStatementTimeout } from "../../timeout/index.js";
import { parseCrawlerConfig } from "../config/index.js";
import type { PinnedEmbedder } from "../embedding/index.js";
import { cosine, embedPending, rankHits, replacePages, searchChunks, type Hit } from "./index.js";

// 진짜 PostgreSQL(pgvector 확장이 있는 것)이 필요한 시험. DUALCONTEXT_TEST_DATABASE_URL 이 있을 때만 돈다.
// 임시 스키마 하나만 만들고 끝나면 지우므로 어느 데이터베이스를 가리켜도 기존 테이블은 건드리지 않는다.
const url = process.env.DUALCONTEXT_TEST_DATABASE_URL;
const skip = url ? false : "DUALCONTEXT_TEST_DATABASE_URL 이 없어 건너뜀";
const schema = `dc_crawl_test_${process.pid}`;
const crawlerSql = new URL("../../../../../docker/initdb/004_crawler.sql", import.meta.url);

let pool: pg.Pool;
const dims = 8;

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const embedderOf = (vector: number[]): PinnedEmbedder => ({ key: "m", baseUrl: "", embed: async () => [vector] });
const config = (over: Record<string, unknown> = {}) => parseCrawlerConfig({ startUrls: ["https://example.com/"], minScore: 0, perPage: 2, topK: 5, ...over });

type Chunk = { url: string; idx: number; embedding: number[] | null; key?: string };
const stored: Chunk[] = [];

before(async () => {
  if (!url) return;
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query("create extension if not exists vector");
  await admin.query(`create schema ${schema}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: url, max: 3, options: `-c search_path=${schema},public` });
  await pool.query("create table researchers (id serial primary key)");
  await pool.query(readFileSync(crawlerSql, "utf8"));
  await pool.query("insert into researchers default values");
  const next = random(4242);
  const insert = async (chunk: Chunk) => {
    await pool.query("insert into crawl_pages (researcher_id, url, title, content_hash) values (1, $1, $2, 'h') on conflict do nothing", [chunk.url, `제목 ${chunk.url}`]);
    await pool.query("insert into crawl_chunks (researcher_id, url, idx, text, embedding, embedding_key) values (1, $1, $2, $3, $4, $5)", [chunk.url, chunk.idx, `${chunk.url}#${chunk.idx}`, chunk.embedding, chunk.key ?? "m"]);
    stored.push(chunk);
  };
  for (let page = 0; page < 6; page += 1) {
    for (let idx = 0; idx < 8; idx += 1) await insert({ url: `https://example.com/p${page}`, idx, embedding: Array.from({ length: dims }, () => next() * 2 - 1) });
  }
  // 점수가 같은 청크(동점은 url, idx 순서로 정해진다).
  const twin = Array.from({ length: dims }, (_, i) => (i === 0 ? 1 : 0));
  await insert({ url: "https://example.com/tie-b", idx: 1, embedding: twin });
  await insert({ url: "https://example.com/tie-a", idx: 3, embedding: twin });
  await insert({ url: "https://example.com/tie-a", idx: 2, embedding: twin });
  // 제외돼야 하는 행: 차원 불일치, NaN 원소, 다른 모델 키, 임베딩 없음.
  await insert({ url: "https://example.com/bad", idx: 0, embedding: [1, 2, 3] });
  await insert({ url: "https://example.com/bad", idx: 1, embedding: [Number.NaN, 1, 0, 0, 0, 0, 0, 0] });
  await insert({ url: "https://example.com/bad", idx: 2, embedding: twin, key: "other-model" });
  await insert({ url: "https://example.com/bad", idx: 3, embedding: null });
});

after(async () => {
  if (!url) return;
  await pool.query(`drop schema ${schema} cascade`);
  await pool.end();
});

/** 정상 범위 행(차원이 맞고 유한하며 키가 맞는)을 JS 코사인으로 순위 매긴 기준 결과. */
function reference(query: number[], over: Record<string, unknown> = {}): Hit[] {
  const usable = stored.filter((chunk) => chunk.key === undefined && chunk.embedding !== null && chunk.embedding.length === dims && chunk.embedding.every(Number.isFinite));
  const hits: Hit[] = usable.map((chunk) => ({ url: chunk.url, idx: chunk.idx, title: `제목 ${chunk.url}`, text: `${chunk.url}#${chunk.idx}`, score: cosine(query, chunk.embedding as number[]) }));
  return rankHits(hits, config(over));
}

test("DB: SQL 코사인 순위가 정상 범위에서 JS 기준 구현과 같다(순서 · 점수 1e-5 이내)", { skip }, async () => {
  const next = random(99);
  for (let round = 0; round < 25; round += 1) {
    const query = Array.from({ length: dims }, () => next() * 2 - 1);
    const over = { minScore: round % 3 === 1 ? 0.2 : 0, perPage: 1 + (round % 3), topK: 3 + (round % 5) };
    const expected = reference(query, over);
    const actual = await searchChunks(pool, embedderOf(query), 1, config(over), "질의");
    assert.deepEqual(actual.map((hit) => hit.text), expected.map((hit) => hit.text), `round ${round}`);
    for (const [i, hit] of actual.entries()) assert.ok(Math.abs(hit.score - (expected[i] as Hit).score) < 1e-5, `round ${round} score ${hit.score} vs ${(expected[i] as Hit).score}`);
  }
});

test("DB: 동점은 url, idx 순서로 결정적이고 페이지당 perPage 가 적용된다", { skip }, async () => {
  const query = Array.from({ length: dims }, (_, i) => (i === 0 ? 1 : 0));
  const hits = await searchChunks(pool, embedderOf(query), 1, config({ minScore: 0.999, perPage: 2, topK: 10 }), "질의");
  assert.deepEqual(hits.map((hit) => hit.text), ["https://example.com/tie-a#2", "https://example.com/tie-a#3", "https://example.com/tie-b#1"]);
  const one = await searchChunks(pool, embedderOf(query), 1, config({ minScore: 0.999, perPage: 1, topK: 10 }), "질의");
  assert.deepEqual(one.map((hit) => hit.text), ["https://example.com/tie-a#2", "https://example.com/tie-b#1"]);
});

test("DB: 차원이 다른 행 · NaN 이 든 행 · 다른 모델 키 · 임베딩 없는 행은 오류 없이 제외된다(수정: 옛 JS 는 앞 차원만 비교하고 NaN 을 전파했다)", { skip }, async () => {
  const query = Array.from({ length: dims }, () => 0.5);
  const hits = await searchChunks(pool, embedderOf(query), 1, config({ topK: 20, perPage: 5 }), "질의");
  assert.ok(hits.length > 0);
  assert.ok(hits.every((hit) => !hit.url.endsWith("/bad")));
});

test("DB: 질의 벡터가 영벡터면 점수는 0 이다(NaN → 0). minScore 가 0 이면 그대로 나오고 0.5 면 나오지 않는다", { skip }, async () => {
  const zero = Array.from({ length: dims }, () => 0);
  const kept = await searchChunks(pool, embedderOf(zero), 1, config({ minScore: 0, topK: 4, perPage: 4 }), "질의");
  assert.equal(kept.length, 4);
  assert.ok(kept.every((hit) => hit.score === 0));
  assert.equal(cosine(zero, [1, 2, 3, 4, 5, 6, 7, 8]), 0, "JS 기준과 같은 값");
  assert.deepEqual(await searchChunks(pool, embedderOf(zero), 1, config({ minScore: 0.5 }), "질의"), []);
});

test("DB: 잘못된 질의 벡터는 쿼리를 보내기 전에 거절하고, 다른 차원의 질의는 맞는 행이 없어 빈 결과다", { skip }, async () => {
  await assert.rejects(searchChunks(pool, embedderOf([Number.NaN, 1]), 1, config(), "질의"), /non-finite/);
  assert.deepEqual(await searchChunks(pool, embedderOf([1, 0, 0]), 1, config({ minScore: 0 }), "질의").then((hits) => hits.filter((hit) => !hit.url.endsWith("/bad"))), [], "3차원 질의는 3차원 행(bad#0)만 맞는다");
});

test("DB: 크롤 결과는 청크를 unnest 한 번으로 넣고, 백필은 읽은 텍스트와 같은 청크에만 벡터를 붙인다", { skip }, async () => {
  await pool.query("insert into researchers default values");
  await pool.query("insert into crawl_state (researcher_id, fingerprint, status) values (2, 'f', 'running')");
  const crawl = parseCrawlerConfig({ startUrls: ["https://example.com/"], chunkChars: 300 });
  const long = Array.from({ length: 12 }, (_, i) => `문장 ${i} 번은 청크가 여러 개로 갈라지도록 충분히 길게 쓴 내용입니다.`).join(" ");
  const stats = await replacePages(pool, 2, crawl, [{ url: "https://example.com/doc", title: "문서", markdown: `# 소개\n\n${long}` }]);
  assert.equal(stats.pages, 1);
  assert.ok(stats.chunks >= 2, `chunks=${stats.chunks}`);
  const rows = (await pool.query("select idx, text from crawl_chunks where researcher_id = 2 order by idx")).rows;
  assert.deepEqual(rows.map((row) => row.idx), rows.map((_, i) => i));

  let swapped = false;
  const embedder: PinnedEmbedder = {
    key: "m",
    baseUrl: "",
    embed: async (texts) => {
      // 백필하는 사이에 0번 청크의 텍스트가 바뀐다(다시 크롤된 것과 같다): 옛 텍스트의 벡터가 붙으면 안 된다.
      if (!swapped) {
        swapped = true;
        await pool.query("update crawl_chunks set text = '바뀐 본문' where researcher_id = 2 and idx = 0");
      }
      return texts.map(() => [1, 0, 0, 0, 0, 0, 0, 0]);
    }
  };
  await embedPending(pool, embedder, 2);
  const after = (await pool.query("select idx, embedding is not null as has_vector, embedding_key from crawl_chunks where researcher_id = 2 order by idx")).rows;
  assert.equal(after[0].has_vector, false, "텍스트가 바뀐 청크에는 옛 벡터가 붙지 않는다");
  assert.ok(after.slice(1).every((row) => row.has_vector && row.embedding_key === "m"));
});

test("DB: 시한은 체크아웃한 연결의 트랜잭션 안에서만 걸리고 풀의 다른 쿼리에 새지 않는다", { skip }, async () => {
  await assert.rejects(withStatementTimeout(pool, (client) => client.query("select pg_sleep(2)"), 100), /statement timeout/);
  const during = await withStatementTimeout(pool, async (client) => (await client.query("show statement_timeout")).rows[0].statement_timeout, 5000);
  assert.equal(during, "5s");
  const after = (await pool.query("show statement_timeout")).rows[0].statement_timeout;
  assert.notEqual(after, "100ms");
  assert.notEqual(after, "5s");
});
