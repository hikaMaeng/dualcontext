// DB 조회형(pgvector) 조사원 3개가 동시에 도는 부하를 만든다: 조사원 2 · 3 · 4(법률 용어 · 판례 · 의학 문제은행)와 같은 두 단계 검색(축소 차원 HNSW 후보 → 전체 차원 재순위).
// 앱 경로(큐 · 실행)를 거치지 않는다: 질의 임베딩은 LM Studio 임베딩 서버(:12345)로, SQL 은 컨테이너 안 psql 세션 3개(워커당 1개, 계속 열어 둠)로 보낸다.
// 사용: node test/20261119/pgvector-concurrent.mjs [seconds=40]   결과: test/20261119/verify/pgvector-concurrent_result.json
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const seconds = Number(process.argv[2] ?? 40);
const embeddingUrl = process.env.EMBED_URL ?? "http://127.0.0.1:12345/v1/embeddings";
const embeddingModel = process.env.EMBED_MODEL ?? "embeddinggemma2:mp";
const out = new URL("./verify/", import.meta.url);
mkdirSync(out, { recursive: true });

const workers = [
  { id: 2, table: "ds_legal_terms" },
  { id: 3, table: "ds_legal_cases" },
  { id: 4, table: "ds_medical_exam" }
];
const queries = ["근로계약서 없이 일했을 때 퇴직금 청구 요건", "임대차 보증금 반환 소송 절차", "당뇨병 환자의 식이요법과 합병증", "부당해고 구제신청 기간", "고혈압 약물 치료 기준", "명예훼손 성립 요건과 처벌", "급성 심근경색의 초기 증상", "상속 포기 기한과 한정승인"];
const topK = 3;
const reducedDim = 256;

const literal = (vector) => `[${vector.join(",")}]`;
function reduceMrl(vector, dim) {
  const head = vector.slice(0, dim);
  const norm = Math.sqrt(head.reduce((sum, value) => sum + value * value, 0)) || 1;
  return head.map((value) => value / norm);
}
const sqlFor = (table, full) => `select title, left(text, 80), 1 - (full_vector <=> '${literal(full)}'::vector) as score from (
  select "title"::text as title, left("body"::text, 1201) as text, "embedding" as full_vector from "public"."${table}" order by "embedding_mrl" <=> '${literal(reduceMrl(full, reducedDim))}'::vector limit ${topK * 8}
) c order by full_vector <=> '${literal(full)}'::vector limit ${topK};
select 'DONE';
`;

async function embed(text) {
  const response = await fetch(embeddingUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: embeddingModel, input: [text] }) });
  if (!response.ok) throw new Error(`embedding ${response.status}`);
  return (await response.json()).data[0].embedding;
}

function openSession() {
  const child = spawn("docker", ["exec", "-i", "dualcontext", "sh", "-c", 'psql "$DUALCONTEXT_DATABASE_URL" -At'], { stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "";
  let waiter = null;
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    if (waiter && buffer.includes("DONE\n")) {
      const text = buffer;
      buffer = "";
      const resolve = waiter;
      waiter = null;
      resolve(text);
    }
  });
  return {
    query: (sql) => new Promise((resolve) => { waiter = resolve; child.stdin.write(sql); }),
    close: () => child.stdin.end()
  };
}

const percentile = (values, p) => (values.length === 0 ? null : [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))]);
// MODE=both(기본: 임베딩 + SQL) | embed(임베딩만, DB 안 씀) | sql(임베딩을 한 번만 받아 재사용하고 SQL 만 반복). 원인 분리용.
const mode = process.env.MODE ?? "both";
const fixed = mode === "sql" ? await embed(queries[0]) : null;
const results = workers.map((worker) => ({ ...worker, rounds: 0, rows: 0, errors: 0, embedMs: [], sqlMs: [] }));
const stopAt = Date.now() + seconds * 1000;
const started = Date.now();

await Promise.all(results.map(async (worker, index) => {
  const session = mode === "embed" ? null : openSession();
  let round = index;
  while (Date.now() < stopAt) {
    const query = queries[round % queries.length];
    round += 1;
    try {
      const t0 = performance.now();
      const full = fixed ?? (await embed(query));
      const t1 = performance.now();
      const text = session ? await session.query(sqlFor(worker.table, full)) : "";
      const t2 = performance.now();
      worker.embedMs.push(Math.round(t1 - t0));
      worker.sqlMs.push(Math.round(t2 - t1));
      worker.rows += text.split("\n").filter((line) => line && line !== "DONE").length;
      worker.rounds += 1;
      if (mode === "sql") await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (error) {
      worker.errors += 1;
      console.error(String(error));
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  session?.close();
}));

const summary = {
  seconds, elapsedMs: Date.now() - started, concurrency: workers.length,
  workers: results.map((w) => ({ id: w.id, table: w.table, rounds: w.rounds, rows: w.rows, errors: w.errors, embedMs: { p50: percentile(w.embedMs, 0.5), p99: percentile(w.embedMs, 0.99), max: Math.max(0, ...w.embedMs) }, sqlMs: { p50: percentile(w.sqlMs, 0.5), p99: percentile(w.sqlMs, 0.99), max: Math.max(0, ...w.sqlMs) } }))
};
writeFileSync(new URL(`./pgvector-concurrent${process.argv[3] ? `_${process.argv[3]}` : ""}_result.json`, out), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 1));
