// 허깅페이스 데이터셋을 받아 임베딩하고 컨테이너 DB 의 ds_* 테이블에 적재한다(호스트에서 실행).
//
//   node apps/dualcontext/seed-data/load-datasets.mjs [옵션] [이름 ...]
//
// 옵션
//   --dry-run      데이터를 몇 행만 받아 매핑 결과와 검증 오류를 출력한다. 임베딩 · DB · API 는 건드리지 않는다.
//   --no-register  적재만 하고 조사원/프로시저 등록(관리 API)은 하지 않는다.
//   --register-only  적재는 건너뛰고 조사원/프로시저 등록만 한다(테이블이 이미 채워져 있을 때).
//
// 대상: 내장 5개(법률 용어 · 판례 · 의학 · 산업 뉴스 · 금융)와 seed-data/domains/<이름>/domain.json 전부.
// 이름을 주면 그 이름(domain.json 의 name 또는 테이블 이름)만 처리한다.
// 환경 변수: EMBED_URL, EMBED_MODEL, EMBED_API_KEY, CONTAINER, LIMIT(내장용 행 수, 기본 600), MRL_DIM, ADMIN_URL
//
// domain.json 형식은 apps/dualcontext/docs/usage.md 의 「분야 추가」 절을 본다.
// 같은 테이블을 다시 적재하면 비우고 새로 채운다(truncate).
import { spawn } from "node:child_process";
import { Agent, fetch } from "undici";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EMBED_URL = process.env.EMBED_URL ?? "http://127.0.0.1:12345/v1";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "embeddinggemma2:mp";
const EMBED_API_KEY = process.env.EMBED_API_KEY ?? "";
const CONTAINER = process.env.CONTAINER ?? "dualcontext";
const ADMIN_URL = process.env.ADMIN_URL ?? "http://127.0.0.1:18081/api/admin";
const BUILTIN_LIMIT = Number(process.env.LIMIT ?? 600);
const MRL_DIM = Number(process.env.MRL_DIM ?? 256);
const PAGE = 100;
const MAX = { title: 300, body: 1500, embed: 1200 };

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const register = !args.includes("--no-register");
const registerOnly = args.includes("--register-only");
const wanted = args.filter((arg) => !arg.startsWith("--"));

const cut = (text, length) => String(text ?? "").replace(/\r/g, "").slice(0, length);

// ---------------------------------------------------------------- 내장 5개 ----

const builtins = [
  {
    name: "ds_legal_terms", table: "ds_legal_terms", dataset: "JusWis/korean-legal-terminology", license: "cc-by-4.0", limit: BUILTIN_LIMIT,
    map: (row) => ({ id: "", title: cut(row.input.replace(/^다음 법률 용어.*?설명해줘:\s*/, ""), 200), body: cut(row.output, 1500), embedText: `${row.input}\n${row.output}` })
  },
  {
    name: "ds_legal_cases", table: "ds_legal_cases", dataset: "ggh5454/korean-legal-qa-dataset", license: "cc-by-4.0", limit: BUILTIN_LIMIT,
    // rows API 가 열 구성 차이로 실패해 원본 jsonl 파일을 받는다(30건).
    file: "https://huggingface.co/datasets/ggh5454/korean-legal-qa-dataset/resolve/main/dataset.jsonl",
    map: (row) => ({ id: row.id, title: cut(row.question, 300), body: cut(row.answer, 1500), embedText: `${row.question}\n${row.answer}` })
  },
  {
    name: "ds_medical_exam", table: "ds_medical_exam", dataset: "hcw0329/medical-korean-alpaca", license: "apache-2.0", limit: BUILTIN_LIMIT,
    map: (row) => ({ id: "", title: cut(`[${row.input}] ${row.instruction}`, 120), body: cut(`${row.instruction}\n정답: ${row.output}`, 1500), embedText: `${row.input}\n${row.instruction}\n정답: ${row.output}` })
  },
  {
    name: "ds_industry_news", table: "ds_industry_news", dataset: "podongchip/korean-synthetic-industry-news", license: "cc-by-4.0 (합성 데이터)", limit: BUILTIN_LIMIT,
    map: (row) => ({ id: row.id, title: cut(row.title, 300), body: cut(row.body, 1500), embedText: `${row.title}\n${row.body}` })
  },
  {
    name: "ds_finance_reports", table: "ds_finance_reports", dataset: "nmixx-fin/synthetic_financial_report_korean", license: "apache-2.0 (합성 데이터)", limit: BUILTIN_LIMIT,
    map: (row) => ({ id: "", title: cut(`[${row.category}] ${row.text.trim()}`, 100), body: cut(row.text.trim(), 1500), embedText: `${row.category}\n${row.text}` })
  }
];

// ------------------------------------------------------------- domain.json ----

const lookup = (row, key) => key.split(".").reduce((value, part) => (value === null || value === undefined ? undefined : value[part]), row);

/** `{열}` / `{열.하위}` 자리표시자를 행의 값으로 바꾼다. 객체는 JSON 으로, 없는 값은 빈 문자열로. */
function render(template, row) {
  return template.replace(/\{([\w.]+)\}/g, (_match, key) => {
    const value = lookup(row, key);
    if (value === undefined || value === null) return "";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  });
}

const placeholders = (template) => [...String(template).matchAll(/\{([\w.]+)\}/g)].map((match) => match[1]);

function validateDomain(spec, folder) {
  const errors = [];
  const need = (condition, message) => condition || errors.push(message);
  need(/^[a-z0-9-]+$/.test(spec.name ?? ""), "name 은 소문자·숫자·하이픈");
  need(spec.name === folder, `name(${spec.name}) 은 폴더 이름(${folder})과 같아야 한다`);
  need(/^ds_[a-z0-9_]+$/.test(spec.table ?? ""), "table 은 ds_ 로 시작하는 소문자·숫자·밑줄");
  need(Boolean(spec.dataset) !== Boolean(spec.file) || Boolean(spec.dataset), "dataset(허깅페이스 id) 또는 file(jsonl URL) 이 필요하다");
  need(typeof spec.license === "string" && spec.license.trim() !== "", "license 가 비어 있다");
  need(Number.isInteger(spec.limit) && spec.limit >= 1 && spec.limit <= 1000, "limit 은 1~1000 정수");
  for (const key of ["title", "body", "embed"]) need(typeof spec.map?.[key] === "string" && spec.map[key] !== "", `map.${key} 템플릿이 필요하다`);
  const researcher = spec.researcher ?? {};
  need(typeof researcher.name === "string" && researcher.name.trim() !== "", "researcher.name");
  need(typeof researcher.description === "string" && researcher.description.length >= 40, "researcher.description(임베딩 라우팅이 읽는 글) 은 40자 이상으로 어떤 질의를 맡는지 구체적으로");
  need(Array.isArray(researcher.keywords) && researcher.keywords.length >= 3, "researcher.keywords 는 3개 이상");
  need(Array.isArray(spec.procedures) && spec.procedures.length >= 2, "procedures 는 2개 이상");
  for (const procedure of spec.procedures ?? []) {
    need(typeof procedure.name === "string" && procedure.name.trim() !== "", "procedure.name");
    need(Array.isArray(procedure.steps) && procedure.steps.length >= 2, `procedure ${procedure.name}: steps 2개 이상`);
    need(Array.isArray(procedure.impacts) && procedure.impacts.length >= 1, `procedure ${procedure.name}: impacts 1개 이상`);
    need(Array.isArray(procedure.appliesWhen), `procedure ${procedure.name}: appliesWhen 은 배열(비어도 된다)`);
    need(typeof procedure.outputFormat === "string", `procedure ${procedure.name}: outputFormat`);
  }
  return errors;
}

async function loadDomains() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "domains");
  const folders = await readdir(root, { withFileTypes: true }).catch(() => []);
  const specs = [];
  // `_` 로 시작하는 폴더(예: _experiments)는 분야가 아니라 산출물 자리다.
  for (const folder of folders.filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))) {
    const raw = JSON.parse(await readFile(path.join(root, folder.name, "domain.json"), "utf8"));
    const errors = validateDomain(raw, folder.name);
    if (errors.length > 0) {
      console.error(`[${folder.name}] domain.json 오류:\n  - ${errors.join("\n  - ")}`);
      process.exitCode = 2;
      continue;
    }
    specs.push({
      ...raw,
      domain: true,
      templates: raw.map,
      map: (row) => ({
        id: raw.map.id ? render(raw.map.id, row) : "",
        title: cut(render(raw.map.title, row), MAX.title),
        body: cut(render(raw.map.body, row), MAX.body),
        embedText: render(raw.map.embed, row)
      })
    });
  }
  return specs;
}

// ---------------------------------------------------------------- 가져오기 ----

// 행 API 는 간헐적으로 502/429 를 낸다. 점점 늘려 가며 최대 6번 시도한다.
async function fetchJson(url, tries = 6) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (response?.ok) return response.json();
    if (attempt === tries) throw new Error(`${url} -> ${response ? response.status : "network error"}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * (tries > 6 ? 6000 : 2000)));
  }
}

/** 데이터셋 전체에서 고르게 limit 행을 뽑는다(앞쪽만 읽으면 정렬된 데이터가 한 곳으로 쏠린다). */
async function fetchRows(source, limit) {
  if (source.filter) return scanAll(source);
  const base = "https://datasets-server.huggingface.co";
  const config = source.config ?? "default";
  const split = source.split ?? "train";
  // 행 수는 데이터셋 전체가 아니라 쓰는 구성(config)의 것이어야 한다. 구성이 여럿인 데이터셋에서
  // 전체 행 수로 오프셋을 잡으면 마지막 쪽이 범위를 벗어난다.
  const size = (await fetchJson(`${base}/size?dataset=${source.dataset}`)).size;
  const total = size.splits?.find((entry) => entry.config === config && entry.split === split)?.num_rows ?? size.configs?.find((entry) => entry.config === config)?.num_rows ?? size.dataset.num_rows;
  const pages = Math.max(1, Math.ceil(Math.min(limit, total) / PAGE));
  const rows = [];
  for (let page = 0; page < pages; page += 1) {
    // 전체가 계획한 행 수 이하이면 처음부터 이어서 읽는다(고르게 흩어 읽으면 쪽이 겹쳐 같은 행이 두 번 들어온다).
    const sequential = total <= limit;
    const offset = sequential || pages === 1 ? (sequential ? page * PAGE : 0) : Math.floor((page * (total - PAGE)) / (pages - 1));
    const length = sequential ? Math.min(PAGE, total - offset) : Math.min(PAGE, limit);
    const json = await fetchJson(`${base}/rows?dataset=${source.dataset}&config=${config}&split=${split}&offset=${offset}&length=${length}`);
    rows.push(...json.rows.map((entry) => entry.row));
  }
  return { rows: rows.slice(0, limit), total };
}


/**
 * filter 가 있는 분야는 데이터셋 전체를 훑어야 한다(분야에 맞는 행이 어디에 있는지 모른다). 한 번 받은 전체는 임시 폴더에 두고
 * 같은 데이터셋을 쓰는 다른 분야가 다시 받지 않게 한다.
 */
async function scanAll(source) {
  const config = source.config ?? "default";
  const split = source.split ?? "train";
  const cache = path.join(os.tmpdir(), "dualcontext-hf-cache", `${source.dataset.replace(/\//g, "__")}__${config}__${split}.json`);
  const cached = await readFile(cache, "utf8").then(JSON.parse, () => null);
  if (cached) return cached;
  const base = "https://datasets-server.huggingface.co";
  const size = (await fetchJson(`${base}/size?dataset=${source.dataset}`)).size;
  const total = size.splits?.find((entry) => entry.config === config && entry.split === split)?.num_rows ?? size.configs?.find((entry) => entry.config === config)?.num_rows ?? size.dataset.num_rows;
  const rows = [];
  for (let offset = 0; offset < total; offset += PAGE) {
    const json = await fetchJson(`${base}/rows?dataset=${source.dataset}&config=${config}&split=${split}&offset=${offset}&length=${PAGE}`, 12);
    await new Promise((resolve) => setTimeout(resolve, 300));
    rows.push(...json.rows.map((entry) => entry.row));
    if (offset % 2000 === 0) process.stdout.write(`  scanning ${rows.length}/${total}`);
  }
  process.stdout.write("done\n");
  const result = { rows, total };
  await mkdir(path.dirname(cache), { recursive: true });
  await writeFile(cache, JSON.stringify(result));
  return result;
}

/** 객관식(A~D + 번호 answer)에는 정답 선택지 글을 answerText 로 덧붙인다. 정답을 모르면 자료로 쓸 수 없다. */
const withAnswerText = (row) =>
  typeof row.answer === "number" && row[["A", "B", "C", "D"][row.answer - 1]] !== undefined ? { ...row, answerText: row[["A", "B", "C", "D"][row.answer - 1]] } : row;

/**
 * 행을 매핑하고, filter(정규식)가 있으면 제목+본문에 그 키워드가 가장 많이 나오는 행 순으로 limit 개를 뽑는다.
 * 한 번 걸린 행까지 고르게 뽑으면 곁다리로 단어만 스친 행이 섞여 분야가 흐려진다.
 */
function pick(source, rows, limit) {
  const mapped = rows.map(withAnswerText).map(source.map).filter((item) => item.title.trim() !== "" && item.body.trim() !== "");
  if (!source.filter) return mapped.slice(0, limit);
  const pattern = new RegExp(source.filter, "g");
  const hits = mapped
    .map((item, order) => ({ item, order, count: [...`${item.title} ${item.body}`.matchAll(pattern)].length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.order - b.order);
  return hits.slice(0, limit).map((entry) => entry.item);
}

async function fetchSource(source, limit) {
  if (source.file) {
    const text = await (await fetch(source.file, { signal: AbortSignal.timeout(120_000) })).text();
    const rows = text.trim().split("\n").map((line) => JSON.parse(line));
    return { rows: rows.slice(0, limit), total: rows.length };
  }
  return fetchRows(source, limit);
}

// ---------------------------------------------------------------- 임베딩 ----

// 임베딩 서버가 다른 작업과 나눠 쓰이면 한 번에 수 분이 걸릴 수 있다. 기본 fetch 의 헤더 대기(300초)에 걸리지 않게
// 15분짜리 Agent 를 쓴다.
const patient = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 });

async function embed(texts) {
  const response = await fetch(`${EMBED_URL}/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(EMBED_API_KEY ? { authorization: `Bearer ${EMBED_API_KEY}` } : {}) },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(900_000),
    dispatcher: patient
  });
  if (!response.ok) throw new Error(`embedding server -> ${response.status} ${(await response.text()).slice(0, 200)}`);
  return (await response.json()).data.sort((a, b) => a.index - b.index).map((entry) => entry.embedding);
}

// Matryoshka 축소: 앞 MRL_DIM 개를 자르고 다시 정규화한다(서버의 reduceMrl 과 같은 계산).
function reduce(vector) {
  const head = vector.slice(0, MRL_DIM);
  const norm = Math.sqrt(head.reduce((sum, value) => sum + value * value, 0)) || 1;
  return head.map((value) => value / norm);
}

const csv = (value) => `"${String(value).replace(/"/g, '""')}"`;

function psql(command, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", CONTAINER, "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "dualcontext", "-v", "ON_ERROR_STOP=1", "-q", "-c", command], {
      stdio: ["pipe", "inherit", "inherit"]
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`psql exited ${code}`))));
    child.stdin.end(input ?? "");
  });
}

/** 표준 모양의 테이블과 축소 컬럼 HNSW 인덱스를 만든다(이미 있으면 그대로). */
const ensureTable = (table) =>
  psql(
    `create table if not exists ${table} (id serial primary key, source_id text, title text not null, body text not null, embedding vector(768), embedding_mrl vector(256));
     create index if not exists ${table}_mrl on ${table} using hnsw (embedding_mrl vector_cosine_ops);`
  );

// ----------------------------------------------------------------- 등록 ----

async function admin(method, route, body) {
  const response = await fetch(`${ADMIN_URL}${route}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${method} ${route} -> ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response.status === 204 ? null : response.json();
}

/** 프로시저는 이름으로, 조사원은 이름으로 만들거나 갱신한다. 연결할 프로시저는 이름으로 찾는다. */
async function registerDomain(spec) {
  const existingProcedures = await admin("GET", "/procedures");
  const ids = new Map(existingProcedures.map((procedure) => [procedure.name, procedure.id]));
  const own = [];
  for (const procedure of spec.procedures) {
    const body = { name: procedure.name, appliesWhen: procedure.appliesWhen, steps: procedure.steps, impacts: procedure.impacts, outputFormat: procedure.outputFormat, enabled: true };
    const saved = ids.has(procedure.name) ? await admin("PUT", `/procedures/${ids.get(procedure.name)}`, body) : await admin("POST", "/procedures", body);
    ids.set(procedure.name, saved.id);
    own.push(saved.id);
  }
  const linked = (spec.link ?? []).map((name) => {
    if (!ids.has(name)) throw new Error(`link 의 프로시저가 없다: ${name}`);
    return ids.get(name);
  });
  const config = { table: spec.table, vectorColumn: "embedding", reducedColumn: "embedding_mrl", reducedDim: MRL_DIM, textColumn: "body", titleColumn: "title", idColumn: "source_id", topK: spec.researcher.topK ?? 3, ...(spec.researcher.minScore === undefined ? {} : { minScore: spec.researcher.minScore }) };
  const body = {
    name: spec.researcher.name, description: spec.researcher.description, keywords: spec.researcher.keywords,
    enabled: true, type: "pgvector", config, procedureIds: [...own, ...linked]
  };
  const existing = (await admin("GET", "/researchers")).find((researcher) => researcher.name === spec.researcher.name);
  const saved = existing ? await admin("PUT", `/researchers/${existing.id}`, body) : await admin("POST", "/researchers", body);
  console.log(`  registered researcher #${saved.id} ${saved.name} with ${saved.procedureIds.length} procedures`);
}

// ------------------------------------------------------------------- 실행 ----

// dry-run 도 실제 적재와 같은 표본(전체 limit 행, 오프셋 포함)을 가져온다. 앞 몇 행만 보면 범위 밖 오프셋 같은 오류를 놓친다.
async function dryRunOne(source) {
  const limit = source.limit ?? BUILTIN_LIMIT;
  const { rows, total } = await fetchSource(source, limit);
  console.log(`  total rows: ${total}; fetched ${rows.length} (planned ${limit}); columns: ${Object.keys(rows[0] ?? {}).join(", ")}`);
  if (!source.filter && rows.length < Math.min(limit, total)) {
    console.log(`  <-- 계획한 ${Math.min(limit, total)}행보다 적게 가져왔다`);
    process.exitCode = 2;
  }
  if (source.templates) {
    const unknown = [...new Set(Object.values(source.templates).flatMap(placeholders))].filter((key) => key !== "answerText" && rows.every((row) => lookup(row, key) === undefined));
    if (unknown.length > 0) {
      console.log(`  <-- 템플릿이 가리키는데 행에 없는 열: ${unknown.join(", ")}`);
      process.exitCode = 2;
    }
  }
  const mapped = pick(source, rows, limit);
  console.log(`  selected ${mapped.length} rows${source.filter ? ` by filter /${source.filter}/` : ""}`);
  if (source.filter && mapped.length < Math.min(limit, 100)) { console.log("  <-- 필터에 맞는 행이 너무 적다"); process.exitCode = 2; }
  mapped.slice(0, 3).forEach((item, index) => {
    console.log(`  [${index}] id=${JSON.stringify(item.id)} title=${JSON.stringify(item.title.slice(0, 80))}`);
    console.log(`      body(${item.body.length})=${JSON.stringify(item.body.slice(0, 120))}`);
    console.log(`      embed(${item.embedText.length})=${JSON.stringify(item.embedText.slice(0, 120))}`);
  });
  const empty = mapped.filter((item) => item.title.trim() === "" || item.body.trim() === "").length;
  console.log(`  empty title/body rows: ${empty}/${mapped.length}${empty > 0 ? "  <-- 템플릿의 열 이름을 확인하라" : ""}`);
  if (empty > 0) process.exitCode = 2;
}

async function loadOne(source) {
  // 테이블은 이미 적재됐고 조사원/프로시저 등록만 다시 하고 싶을 때.
  if (registerOnly) {
    if (!source.domain) return console.log("  (내장 분야는 서버 시작 시 등록되므로 건너뜀)");
    return registerDomain(source);
  }
  const limit = source.limit ?? BUILTIN_LIMIT;
  const { rows } = await fetchSource(source, limit);
  const items = pick(source, rows, limit);
  console.log(`  ${items.length} usable rows of ${rows.length}`);

  const lines = [];
  for (let start = 0; start < items.length; start += 16) {
    const batch = items.slice(start, start + 16);
    const vectors = await embed(batch.map((item) => cut(item.embedText, MAX.embed)));
    batch.forEach((item, index) => {
      lines.push([item.id, item.title, item.body, `[${vectors[index].join(",")}]`, `[${reduce(vectors[index]).join(",")}]`].map(csv).join(","));
    });
    process.stdout.write(`\r  embedded ${Math.min(start + 16, items.length)}/${items.length}`);
  }
  process.stdout.write("\n");

  await ensureTable(source.table);
  await psql(`truncate table ${source.table} restart identity`);
  await psql(`\\copy ${source.table} (source_id, title, body, embedding, embedding_mrl) from stdin with (format csv)`, lines.join("\n") + "\n");
  console.log(`  loaded ${lines.length} rows into ${source.table}`);
  if (source.domain && register) await registerDomain(source);
}

const sources = [...builtins, ...(await loadDomains())].filter((source) => wanted.length === 0 || wanted.includes(source.name) || wanted.includes(source.table));
if (wanted.length > 0 && sources.length === 0) {
  console.error(`일치하는 이름이 없다: ${wanted.join(", ")}`);
  process.exit(2);
}
for (const source of sources) {
  console.log(`== ${source.name} <- ${source.dataset ?? source.file} (${source.license})${dryRun ? " [dry-run]" : ""}`);
  await (dryRun ? dryRunOne(source) : loadOne(source));
}
