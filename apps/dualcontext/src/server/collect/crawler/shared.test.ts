import assert from "node:assert/strict";
import test from "node:test";
import { isAbort } from "../abort/index.js";
import { parseCrawlerConfig } from "./config/index.js";
import { assertVector, EmbeddingSettingsChanged, pinEmbedder, vectorLiteral, type EmbeddingPort } from "./embedding/index.js";
import { crawlStatus, collectCrawler } from "./index.js";
import { embedPending, searchParams, searchSql } from "./store/index.js";
import { walk, type WalkDeps } from "./walk/index.js";

type Call = { text: string; params: unknown[] };

/** 쿼리를 기록하고 문장 조각으로 응답을 고르는 가짜 풀(실제 DB 시험은 sql.db.test.ts). */
function fakePool(respond: (text: string, params: unknown[]) => unknown[] = () => []) {
  const calls: Call[] = [];
  const pool = {
    async query(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      return { rows: respond(text, params) };
    }
  };
  return { pool: pool as never, calls };
}

const port = (model: () => string, embed: (texts: string[]) => Promise<number[][]> = async (texts) => texts.map(() => [1, 0])): EmbeddingPort => ({
  settings: async () => ({ embedding: { baseUrl: "http://embed", model: model() } }),
  embed
});

test("SQL 계약: 실제 쿼리 텍스트가 materialized 선필터 · 점수 규칙 · 페이지별 순위 · 결정적 정렬을 담는다", () => {
  assert.match(searchSql, /with c as materialized \(/);
  assert.match(searchSql, /array_length\(c\.embedding, 1\) = \$3/);
  assert.match(searchSql, /c\.embedding is not null/);
  assert.match(searchSql, /c\.embedding_key = \$2/);
  assert.match(searchSql, /c\.embedding::vector <=> \$4::text::vector/);
  assert.match(searchSql, /d\.v = 'NaN'::double precision then 0::double precision else 1 - d\.v end as score/);
  assert.match(searchSql, /where s\.score >= \$5/);
  assert.match(searchSql, /row_number\(\) over \(partition by s\.url order by s\.score desc, s\.idx\)/);
  assert.match(searchSql, /where r\.rn <= \$6\s+order by r\.score desc, r\.url, r\.idx\s+limit \$7/);
  // 선필터(차원 · NULL · 비유한)는 캐스트(`::vector`)가 있는 s 보다 앞의 c 안에 있다.
  assert.ok(searchSql.indexOf("array_length") < searchSql.indexOf("::vector"));
});

test("SQL 파라미터: 질의 벡터는 [a,b,c] 문자열로, 차원은 길이로 바인딩하고, 잘못된 벡터는 던진다", () => {
  assert.deepEqual(searchParams(7, "model-x", [0.5, -1, 2], { minScore: 0.5, perPage: 2, topK: 3 }), [7, "model-x", 3, "[0.5,-1,2]", 0.5, 2, 3]);
  assert.equal(vectorLiteral([1, 2]), "[1,2]");
  const config = { minScore: 0, perPage: 1, topK: 1 };
  for (const bad of [[], [NaN], [Infinity], [-Infinity], [1, null], [[1, 2]], "[1,2]", [1e39], Array.from({ length: 16_001 }, () => 1)]) {
    assert.throws(() => searchParams(1, "m", bad as never, config), Error, JSON.stringify(bad).slice(0, 40));
  }
  assert.throws(() => assertVector([1, 2], "v", 3), /dimensions/);
  assertVector([1, 2, 3], "v", 3);
});

test("임베딩 고정: 키는 시작 때 읽은 모델 이름이고, 호출 앞뒤로 설정이 바뀌면 벡터를 버린다", async () => {
  let model = "embed-a";
  const pinned = await pinEmbedder(port(() => model));
  assert.equal(pinned.key, "embed-a");
  assert.deepEqual(await pinned.embed(["x"]), [[1, 0]]);
  model = "embed-b";
  await assert.rejects(pinned.embed(["x"]), EmbeddingSettingsChanged);
  assert.equal(pinned.key, "embed-a", "고정한 키는 바뀌지 않는다");

  model = "embed-a";
  const racing = await pinEmbedder(port(() => model, async (texts) => { model = "embed-b"; return texts.map(() => [1, 0]); }));
  await assert.rejects(racing.embed(["x"]), EmbeddingSettingsChanged);
});

test("백필: 같은 (조사원, 모델) 호출은 한 번만 돌고, UPDATE 는 읽은 텍스트와 같을 때만 적용하며, 모델이 다르면 따로 돈다", async () => {
  const rows = [{ url: "https://e.com/a", idx: 0, text: "본문 A" }, { url: "https://e.com/a", idx: 1, text: "본문 B" }];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { pool, calls } = fakePool((text) => (text.startsWith("select url, idx, text") ? rows : []));
  let embedCalls = 0;
  const gated = port(() => "embed-a", async (texts) => { embedCalls += 1; await gate; return texts.map(() => [0.1, 0.2]); });
  const first = embedPending(pool, await pinEmbedder(gated), 5);
  const second = embedPending(pool, await pinEmbedder(gated), 5);
  assert.equal(first, second, "단일 비행: 같은 약속");
  const other = embedPending(pool, await pinEmbedder(port(() => "embed-b")), 5);
  assert.notEqual(other, first, "다른 모델은 다른 비행");
  release();
  assert.equal(await first, 2);
  await other;
  assert.equal(embedCalls, 1);
  const updates = calls.filter((call) => call.text.startsWith("update crawl_chunks") && call.params[4] === "embed-a");
  assert.equal(updates.length, 2);
  assert.match(updates[0]?.text ?? "", /and text = \$6$/);
  assert.deepEqual(updates[0]?.params, [5, "https://e.com/a", 0, [0.1, 0.2], "embed-a", "본문 A"]);
  assert.equal(await embedPending(pool, await pinEmbedder(port(() => "embed-a")), 5), 2, "끝난 비행은 지워져 다음 호출이 새로 돈다");
});

test("백필: 잘못된 벡터(NaN · 차원 · 개수 불일치)는 저장하지 않고 던진다", async () => {
  const rows = [{ url: "https://e.com/a", idx: 0, text: "x" }];
  const run = async (vectors: number[][]) => {
    const { pool, calls } = fakePool((text) => (text.startsWith("select url, idx, text") ? rows : []));
    const name = `m-${Math.random()}`;
    await embedPending(pool, await pinEmbedder(port(() => name, async () => vectors)), 9);
    return calls;
  };
  await assert.rejects(run([[NaN, 1]]), /non-finite/);
  await assert.rejects(run([]), /returned 0 vectors/);
  assert.equal((await run([[1, 2]])).filter((call) => call.text.startsWith("update")).length, 1);
});

type Site = { fail?: boolean };
const walkDeps = (overrides: Partial<WalkDeps> = {}): WalkDeps => ({
  now: () => Date.now(),
  sleep: async () => undefined,
  resolve: async () => ["93.184.216.34"],
  fetchRobots: async () => null,
  fetchPage: async (url): Promise<never> => { throw new Error(`boom ${url}`); },
  ...overrides
});

test("워크: 취소는 robots 실패(금지)나 페이지 실패(건너뜀)로 삼키지 않고 그대로 던진다", async () => {
  const config = parseCrawlerConfig({ startUrls: ["https://example.com/"] });
  const controller = new AbortController();
  controller.abort(Object.assign(new Error("cancelled"), { name: "RunAborted" }));
  await assert.rejects(walk(config, walkDeps(), controller.signal), (error) => isAbort(error));

  const live = new AbortController();
  const robotsAbort = walkDeps({ fetchRobots: async () => { throw new DOMException("aborted", "AbortError"); } });
  await assert.rejects(walk(config, robotsAbort, live.signal), (error) => isAbort(error));
  const pageAbort = walkDeps({ fetchPage: async () => { throw new DOMException("aborted", "AbortError"); } });
  await assert.rejects(walk(config, pageAbort, live.signal), (error) => isAbort(error));
  const failed = await walk(config, walkDeps(), live.signal);
  assert.ok(failed.skipped.some((entry) => entry.reason.startsWith("fetch failed")), "일반 실패는 이전처럼 건너뜀으로 기록된다");
});

test("워크: 한 페이지의 링크는 판정 묶음 하나로 정규식 스레드에 보낸다(링크마다 부르지 않는다)", async () => {
  const config = parseCrawlerConfig({ startUrls: ["https://example.com/"], depth: 1, includePatterns: ["^/docs"] });
  const batches: string[][] = [];
  const site: Record<string, string[]> = { "https://example.com/": ["/docs/a", "/docs/b", "/blog", "/doc.pdf", "https://other.org/x"] };
  const deps = walkDeps({
    fetchPage: async (url) => ({ finalUrl: url, title: "t", markdown: "내용 ".repeat(20), links: site[url] ?? [] }),
    judgeLinks: async (_include, _exclude, targets) => { batches.push(targets); return targets.map((target) => target.startsWith("/docs")); }
  });
  const result = await walk(config, deps);
  assert.deepEqual(batches, [["/docs/a", "/docs/b", "/blog"]]);
  assert.deepEqual(result.pages.map((page) => page.url), ["https://example.com/", "https://example.com/docs/a", "https://example.com/docs/b"]);
});

test("크롤러: 첫 실패 뒤 60초 동안은 크롤을 되풀이하지 않고 같은 오류를 돌려주며, 요청 취소는 공유 크롤을 죽이지 않는다", async () => {
  const { pool } = fakePool();
  const raw = { startUrls: ["https://example.com/"], delayMs: 500 };
  let fetches = 0;
  const deps = walkDeps({ fetchPage: async (): Promise<never> => { fetches += 1; throw new Error("boom"); } });
  const model = port(() => "embed-a");
  await assert.rejects(collectCrawler(pool, model, 101, raw, "질의", { walkDeps: deps }), /crawl produced no pages/);
  assert.equal(fetches, 1);
  await assert.rejects(collectCrawler(pool, model, 101, raw, "질의", { walkDeps: deps }), /crawl produced no pages/);
  assert.equal(fetches, 1, "백오프 중에는 크롤하지 않는다");

  // 공유 크롤: 요청이 취소돼도 크롤은 자기 신호로 계속되고(요청 신호가 fetch 에 가지 않는다), 요청만 즉시 끝난다.
  let release: () => void = () => undefined;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let seen: AbortSignal | undefined;
  const slow = walkDeps({ fetchPage: async (_url, signal): Promise<never> => { seen = signal; await hold; throw new Error("late failure"); } });
  const request = new AbortController();
  const waiting = collectCrawler(pool, model, 202, raw, "질의", { walkDeps: slow, signal: request.signal });
  await new Promise((resolve) => setTimeout(resolve, 50));
  request.abort(Object.assign(new Error("cancelled"), { name: "RunAborted" }));
  await assert.rejects(waiting, (error) => isAbort(error));
  assert.equal((await crawlStatus(pool, 202)).running, true, "요청이 취소돼도 크롤은 진행 중이다");
  assert.ok(seen !== undefined && !seen.aborted && seen !== request.signal);
  release();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal((await crawlStatus(pool, 202)).running, false);
});
