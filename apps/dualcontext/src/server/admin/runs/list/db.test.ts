import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { readFilterOptions } from "./filters/index.js";
import { listRuns } from "./index.js";
import type { ListParams } from "./params/index.js";

// 진짜 PostgreSQL(pgvector + textsearch_ko 가 있는 것)이 필요한 시험. DUALCONTEXT_TEST_DATABASE_URL 이 있을 때만 돈다.
// 임시 스키마 하나만 만들고 끝나면 지우므로 어느 데이터베이스를 가리켜도 기존 테이블은 건드리지 않는다.
const url = process.env.DUALCONTEXT_TEST_DATABASE_URL;
const skip = url ? false : "DUALCONTEXT_TEST_DATABASE_URL 이 없어 건너뜀";
const schema = `dc_runs_test_${process.pid}`;
const initdb = new URL("../../../../../docker/initdb/", import.meta.url);

const params = (over: Partial<ListParams> = {}): ListParams => ({ page: 1, pageSize: 20, researchers: [], procedures: [], q: "", mode: "keyword", ...over });
let pool: pg.Pool;
const noEmbedding = { embed: async () => Promise.reject(new Error("쓰지 않는다")), settings: async () => ({ embedding: { baseUrl: "", model: "m", apiKey: "" }, chat: { baseUrl: "", model: "", apiKey: "" } }) };

async function insert(query: string, pairs: unknown[], extra: { context?: string; before?: string; after?: string } = {}) {
  const answers = extra.before || extra.after ? { before: { text: extra.before ?? "" }, after: { text: extra.after ?? "" } } : null;
  const { rows } = await pool.query("insert into augment_runs (query, status, duration_ms, settings, pairs, context, answers) values ($1, 'ok', 1, '{}', $2, $3, $4) returning id", [
    query, JSON.stringify(pairs), extra.context ?? null, answers && JSON.stringify(answers)
  ]);
  return rows[0].id as number;
}

before(async () => {
  if (!url) return;
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`create schema ${schema}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: url, max: 2, options: `-c search_path=${schema},public` });
  for (const file of readdirSync(initdb).filter((name) => name.endsWith(".sql")).sort()) await pool.query(readFileSync(new URL(file, initdb), "utf8"));
});

after(async () => {
  if (!url) return;
  await pool.query(`drop schema ${schema} cascade`);
  await pool.end();
});

test("DB: 005 는 두 번 돌려도 오류가 없다(멱등)", { skip }, async () => {
  const sql = readFileSync(new URL("005_runs_search.sql", initdb), "utf8");
  await pool.query(sql);
  await pool.query(sql);
});

test("DB: 이름 추출은 중복 제거 · 순서 유지 · null 프로시저 제외", { skip }, async () => {
  const id = await insert("이름", [
    { researcher: "코드", procedure: "P1" }, { researcher: "코드", procedure: null }, { researcher: "문서", procedure: "P2" }, { researcher: "코드", procedure: "P1" }
  ]);
  const { rows } = await pool.query("select researcher_names, procedure_names from augment_runs where id = $1", [id]);
  assert.deepEqual(rows[0], { researcher_names: ["코드", "문서"], procedure_names: ["P1", "P2"] });
  const empty = await pool.query("select researcher_names, procedure_names from augment_runs where id = $1", [await insert("빈 쌍", [])]);
  assert.deepEqual(empty.rows[0], { researcher_names: [], procedure_names: [] });
});

test("DB: 갱신 쿼리만 해도 pairs · context · answers 가 이름과 검색 문서에 반영된다", { skip }, async () => {
  const id = await insert("진행 중 실행", []);
  assert.equal((await listRuns(pool, noEmbedding, params({ q: "형태소" }))).items.some((item) => item.id === id), false);
  await pool.query("update augment_runs set pairs = $2, context = $3 where id = $1", [id, JSON.stringify([{ researcher: "진행조사원", procedure: null }]), "형태소 분석 컨텍스트"]);
  await pool.query(`update augment_runs set answers = coalesce(answers, '{}'::jsonb) || jsonb_build_object('after', '{"text":"최종 출력 lighthouse"}'::jsonb) where id = $1`, [id]);
  const hit = (q: string) => listRuns(pool, noEmbedding, params({ q })).then((page) => page.items.some((item) => item.id === id));
  assert.equal(await hit("형태소"), true);
  assert.equal(await hit("lighthouse"), true);
  assert.deepEqual((await listRuns(pool, noEmbedding, params({ researchers: ["진행조사원"] }))).items.map((item) => item.id), [id]);
});

test("DB: 필터는 종류 안 OR, 종류 사이 AND, 검색어와 AND 이고 total 은 쪽과 무관하다", { skip }, async () => {
  const a = await insert("필터 시험 가", [{ researcher: "RA", procedure: "PX" }]);
  const b = await insert("필터 시험 나", [{ researcher: "RB", procedure: "PY" }]);
  const c = await insert("필터 시험 다", [{ researcher: "RA", procedure: "PY" }, { researcher: "RB", procedure: null }]);
  const ids = async (over: Partial<ListParams>) => (await listRuns(pool, noEmbedding, params(over))).items.map((item) => item.id);
  assert.deepEqual(await ids({ researchers: ["RA"] }), [c, a]);
  assert.deepEqual(await ids({ researchers: ["RA", "RB"] }), [c, b, a]); // OR
  assert.deepEqual(await ids({ researchers: ["RA", "RB"], procedures: ["PX"] }), [a]); // 종류 사이 AND
  assert.deepEqual(await ids({ procedures: ["PX", "PY"] }), [c, b, a]);
  assert.deepEqual(await ids({ researchers: ["RA", "RB"], q: "시험 나" }), [b]); // 검색어 AND
  assert.deepEqual(await ids({ researchers: ["RA"], q: "시험 나" }), []);
  assert.deepEqual(await ids({ researchers: ["없는조사원"] }), []);
  const second = await listRuns(pool, noEmbedding, params({ researchers: ["RA", "RB"], pageSize: 2, page: 2 }));
  assert.equal(second.total, 3);
  assert.deepEqual(second.items.map((item) => item.id), [a]);
});

test("DB: 한국어 어절과 영어 단어를 질의 · 최종 출력 · context 에서 찾는다", { skip }, async () => {
  const q = await insert("얕은 클론으로 저장소를 받는 방법", []);
  const out = await insert("다른 질문", [], { after: "예외 처리를 꼭 하세요", before: "shallow clone 설명" });
  const ctx = await insert("또 다른 질문", [], { context: "## 자료\nGit handles repositories with depth" });
  const hit = async (text: string) => (await listRuns(pool, noEmbedding, params({ q: text }))).items.map((item) => item.id).sort((x, y) => x - y);
  assert.ok((await hit("얕은 클론")).includes(q));
  assert.ok((await hit("예외 처리")).includes(out));
  assert.ok((await hit("shallow")).includes(out));
  assert.ok((await hit("clone")).includes(out));
  assert.ok((await hit("repository")).includes(ctx)); // 영어 어간 처리
  assert.deepEqual((await hit("존재하지않는단어xyz")), []);
  const first = (await listRuns(pool, noEmbedding, params({ q: "얕은 클론" }))).items.find((item) => item.id === q);
  assert.equal(first?.match?.by, "keyword");
  assert.ok((first?.match?.score ?? 0) > 0);
});

// pgvector 는 float4 로 계산하므로 유사도 허용 오차는 1e-6 이다.
test("DB: 의미 검색은 유사도 내림차순이고 최소 유사도 · 다른 모델 · 다른 차원은 제외한다", { skip }, async () => {
  const near = await insert("의미 가까움", []);
  const mid = await insert("의미 중간", []);
  const far = await insert("의미 멂", []);
  const otherModel = await insert("다른 모델", []);
  const otherDims = await insert("다른 차원", []);
  const set = (id: number, vector: number[], key = "m") => pool.query("update augment_runs set query_embedding = $2, embedding_key = $3 where id = $1", [id, vector, key]);
  await set(near, [1, 0, 0]);
  await set(mid, [0.9, 0.4358898943540674, 0]); // cos 0.9 (최소 유사도 0.8 이상)
  await set(far, [0.6, 0.8, 0]); // cos 0.6 → 최소 유사도 미만
  await set(otherModel, [1, 0, 0], "다른-모델");
  await set(otherDims, [1, 0]);
  const model = { ...noEmbedding, embed: async () => [[1, 0, 0]] };
  const page = await listRuns(pool, model, params({ q: "아무거나", mode: "semantic", researchers: [] }));
  assert.deepEqual(page.items.map((item) => item.id), [near, mid]);
  assert.equal(page.total, 2);
  assert.equal(page.items[0].match?.by, "semantic");
  assert.ok(Math.abs(page.items[0].match!.score - 1) < 1e-6);
  assert.ok(Math.abs(page.items[1].match!.score - 0.9) < 1e-6);
});

test("DB: 필터 이름은 실행 기록에 나온 것만 가나다순이다", { skip }, async () => {
  const options = await readFilterOptions(pool);
  const sorted = (names: string[]) => [...names].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  assert.deepEqual(options.researchers, sorted(options.researchers));
  assert.ok(options.researchers.includes("RA") && options.researchers.includes("코드"));
  assert.ok(options.procedures.includes("PX") && !options.procedures.includes(""));
});
