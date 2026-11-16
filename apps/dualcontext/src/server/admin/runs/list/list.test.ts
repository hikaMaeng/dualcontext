import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import { backfillEmbeddings, embedRunQuery } from "../embedding/index.js";
import { EmbeddingUnavailable, listRuns } from "./index.js";
import { defaultPageSize, maxPageSize, parseListParams, type ListParams } from "./params/index.js";
import { buildListQueries } from "./query/index.js";
import { minSimilarity } from "./semantic/index.js";

const params = (over: Partial<ListParams> = {}): ListParams => ({ page: 1, pageSize: 20, researchers: [], procedures: [], q: "", mode: "keyword", ...over });
const parsed = (query: Record<string, unknown>) => {
  const result = parseListParams(query);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.ok ? result.params : params();
};

test("파라미터: 기본값은 1쪽 20건 키워드 모드이고, 필터는 반복 키로 받는다", () => {
  assert.deepEqual(parsed({}), { page: 1, pageSize: defaultPageSize, researchers: [], procedures: [], q: "", mode: "keyword" });
  const many = parsed({ researcher: ["A", "B", "A"], procedure: "X", q: "  얕은 클론 ", mode: "semantic", page: "3", pageSize: "100" });
  assert.deepEqual(many, { page: 3, pageSize: 100, researchers: ["A", "B"], procedures: ["X"], q: "얕은 클론", mode: "semantic" });
});

test("파라미터: 잘못된 값은 이유와 함께 거부한다", () => {
  const bad: Record<string, unknown>[] = [
    { page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "abc" }, { page: ["1", "2"] },
    { pageSize: "0" }, { pageSize: String(maxPageSize + 1) }, { pageSize: "x" },
    { mode: "fuzzy" }, { q: ["a", "b"] }, { q: "x".repeat(501) },
    { researcher: { a: "b" } }, { researcher: [""] }, { procedure: "p".repeat(201) },
    { researcher: Array.from({ length: 51 }, (_v, index) => `r${index}`) }
  ];
  for (const query of bad) {
    const result = parseListParams(query);
    assert.equal(result.ok, false, JSON.stringify(query));
  }
});

test("쿼리 빌더: 필터가 없으면 where 가 없고 최신순이며 쪽은 offset 으로 계산한다", () => {
  const { page, count } = buildListQueries(params({ page: 3, pageSize: 20 }));
  assert.doesNotMatch(page.text, /where/);
  assert.match(page.text, /order by id desc limit \$1 offset \$2/);
  assert.deepEqual(page.values, [20, 40]);
  assert.doesNotMatch(count.text, /where/);
  assert.deepEqual(count.values, []);
});

test("쿼리 빌더: 조사원과 프로시저 필터는 각각 한 번의 배열 겹침(OR)이고 둘 사이는 AND 다", () => {
  const { page, count } = buildListQueries(params({ researchers: ["A", "B"], procedures: ["X", "Y"] }));
  assert.match(page.text, /where researcher_names && \$1::text\[\] and procedure_names && \$2::text\[\]/);
  assert.deepEqual(page.values.slice(0, 2), [["A", "B"], ["X", "Y"]]);
  assert.deepEqual(count.values, [["A", "B"], ["X", "Y"]]);
  assert.doesNotMatch(page.text, /\bor\b/i);
});

test("쿼리 빌더: 검색어는 필터와 AND 로 묶이고 순위 점수를 같이 읽는다. 정렬은 그래도 최신순이다", () => {
  const { page, count } = buildListQueries(params({ researchers: ["A"], q: "예외 처리" }));
  assert.match(page.text, /researcher_names && \$1::text\[\] and search_tsv @@ plainto_tsquery\('korean', \$2\)/);
  assert.match(page.text, /ts_rank\(search_tsv, plainto_tsquery\('korean', \$2\)\) as score/);
  assert.match(page.text, /order by id desc/);
  assert.deepEqual(page.values, [["A"], "예외 처리", 20, 0]);
  assert.deepEqual(count.values, [["A"], "예외 처리"]);
});

test("쿼리 빌더: 의미 검색은 모델 키와 최소 유사도로 거르고 유사도 내림차순이다", () => {
  const { page, count } = buildListQueries(params({ q: "클론", mode: "semantic", procedures: ["X"] }), { vector: [0.1, 0.2], embeddingKey: "m", minSimilarity });
  assert.match(page.text, /embedding_key = \$\d/);
  assert.match(page.text, /order by score desc, id desc/);
  assert.match(page.text, /array_length\(query_embedding, 1\)/);
  assert.doesNotMatch(page.text, /plainto_tsquery/);
  assert.deepEqual(page.values, [["X"], "[0.1,0.2]", 2, "m", minSimilarity, 20, 0]);
  assert.equal(count.values.length, 5);
});

test("쿼리 빌더: 사용자 값은 SQL 문장에 한 글자도 들어가지 않는다(인젝션)", () => {
  const evil = "x'); drop table augment_runs; --";
  const { page, count } = buildListQueries(params({ researchers: [evil], procedures: [evil], q: evil }), undefined);
  const semantic = buildListQueries(params({ q: evil, mode: "semantic" }), { vector: [1], embeddingKey: evil, minSimilarity });
  for (const built of [page, count, semantic.page, semantic.count]) {
    assert.doesNotMatch(built.text, /drop table|x'\)/);
    // 문장에 있는 $n 은 모두 values 안의 자리다.
    const used = [...built.text.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
    assert.ok(used.every((n) => n >= 1 && n <= built.values.length));
  }
  assert.ok(page.values.includes(evil));
});

type Call = { text: string; values: unknown[] };
function fakePool(rows: unknown[], total: number) {
  const calls: Call[] = [];
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      return /count\(\*\)/.test(text) ? { rows: [{ total }] } : { rows };
    }
  } as unknown as pg.Pool;
  return { pool, calls };
}
const fakeModel = (embed: (texts: string[]) => Promise<number[][]>) => ({ embed, settings: async () => ({ embedding: { baseUrl: "", model: "m", apiKey: "" }, chat: { baseUrl: "", model: "", apiKey: "" } }) });
const row = (id: number, score: number | null) => ({ id, createdAt: "2026-01-01T00:00:00.000Z", query: `질의 ${id}`, status: "ok", durationMs: 5, researchers: ["A"], procedures: [], score });

test("listRuns: total · page · pageSize 를 그대로 싣고, q 가 없으면 match 를 붙이지 않는다", async () => {
  const { pool } = fakePool([row(5, null), row(4, null)], 42);
  const page = await listRuns(pool, fakeModel(async () => []), params({ page: 2, pageSize: 2 }));
  assert.equal(page.total, 42);
  assert.equal(page.page, 2);
  assert.equal(page.pageSize, 2);
  assert.deepEqual(page.items.map((item) => item.id), [5, 4]);
  assert.ok(page.items.every((item) => !("match" in item) && !("score" in item)));
});

test("listRuns: 키워드 검색은 점수를 match 로 싣는다. 질의는 자르지 않는다", async () => {
  const long = "가".repeat(5000);
  const { pool } = fakePool([{ ...row(1, 0.5), query: long }], 1);
  const page = await listRuns(pool, fakeModel(async () => []), params({ q: "가" }));
  assert.deepEqual(page.items[0].match, { by: "keyword", score: 0.5 });
  assert.equal(page.items[0].query.length, 5000);
});

test("listRuns: 의미 검색은 q 를 임베딩해 쿼리에 넘기고 match.by 가 semantic 이다", async () => {
  const embedded: string[][] = [];
  const { pool, calls } = fakePool([row(3, 0.9)], 1);
  const page = await listRuns(pool, fakeModel(async (texts) => (embedded.push(texts), [[1, 0]])), params({ q: "얕은 클론", mode: "semantic" }));
  assert.deepEqual(embedded[0], ["얕은 클론"]);
  assert.deepEqual(page.items[0].match, { by: "semantic", score: 0.9 });
  assert.equal(calls[0].values.includes("[1,0]"), true);
});

test("listRuns: 임베딩 서버가 실패하면 빈 결과가 아니라 EmbeddingUnavailable 을 던진다", async () => {
  const { pool } = fakePool([], 0);
  await assert.rejects(listRuns(pool, fakeModel(async () => Promise.reject(new Error("connect refused"))), params({ q: "x", mode: "semantic" })), (error) => {
    assert.ok(error instanceof EmbeddingUnavailable);
    assert.match(error.message, /connect refused/);
    return true;
  });
  await assert.rejects(listRuns(pool, fakeModel(async () => [[]]), params({ q: "x", mode: "semantic" })), EmbeddingUnavailable);
});

test("listRuns: semantic 이어도 q 가 비면 임베딩하지 않고 일반 목록이다", async () => {
  const { pool } = fakePool([row(1, null)], 1);
  const page = await listRuns(pool, fakeModel(async () => Promise.reject(new Error("부르면 안 된다"))), params({ mode: "semantic" }));
  assert.equal(page.items.length, 1);
});

test("임베딩 저장: 실패해도 던지지 않고 false, 성공하면 벡터와 모델 키를 저장한다", async () => {
  const { pool, calls } = fakePool([], 0);
  assert.equal(await embedRunQuery(pool, fakeModel(async () => Promise.reject(new Error("down"))), 1, "질의"), false);
  assert.equal(calls.length, 0);
  assert.equal(await embedRunQuery(pool, fakeModel(async () => [[0.5, 0.5]]), 7, "질의"), true);
  assert.deepEqual(calls[0].values, [7, [0.5, 0.5], "m"]);
});

test("백필: 상한만큼만 읽고, 한 배치가 실패하면 멈춘다", async () => {
  const { pool, calls } = fakePool(Array.from({ length: 40 }, (_v, index) => ({ id: 40 - index, query: `q${index}` })), 0);
  let batches = 0;
  const done = await backfillEmbeddings(pool, fakeModel(async (texts) => (++batches === 2 ? Promise.reject(new Error("down")) : texts.map(() => [1]))), 40);
  assert.equal(done, 16);
  assert.equal(batches, 2);
  assert.equal(calls[0].values[1], 40);
});
