// 허깅페이스 데이터셋을 받아 임베딩하고 컨테이너 DB 의 ds_* 테이블에 적재한다(호스트에서 실행).
//   node apps/dualcontext/seed-data/load-datasets.mjs [테이블이름 ...]
// 환경 변수: EMBED_URL, EMBED_MODEL, EMBED_API_KEY, CONTAINER, LIMIT(테이블당 행 수), MRL_DIM
// 같은 테이블을 다시 적재하면 비우고 새로 채운다(truncate). 라이선스는 아래 sources 에 적혀 있다.
import { spawn } from "node:child_process";

const EMBED_URL = process.env.EMBED_URL ?? "http://127.0.0.1:12345/v1";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "embeddinggemma2:mp";
const EMBED_API_KEY = process.env.EMBED_API_KEY ?? "";
const CONTAINER = process.env.CONTAINER ?? "dualcontext";
const LIMIT = Number(process.env.LIMIT ?? 1500);
const MRL_DIM = Number(process.env.MRL_DIM ?? 256);
const PAGE = 100;

const cut = (text, length) => String(text ?? "").replace(/\r/g, "").slice(0, length);

const sources = [
  {
    table: "ds_legal_terms",
    dataset: "JusWis/korean-legal-terminology",
    license: "cc-by-4.0",
    map: (row) => ({
      id: "",
      title: cut(row.input.replace(/^다음 법률 용어.*?설명해줘:\s*/, ""), 200),
      body: cut(row.output, 1500),
      embedText: `${row.input}\n${row.output}`
    })
  },
  {
    table: "ds_legal_cases",
    dataset: "ggh5454/korean-legal-qa-dataset",
    license: "cc-by-4.0",
    // rows API 가 열 구성 차이로 실패해 원본 jsonl 파일을 받는다(30건).
    file: "https://huggingface.co/datasets/ggh5454/korean-legal-qa-dataset/resolve/main/dataset.jsonl",
    map: (row) => ({ id: row.id, title: cut(row.question, 300), body: cut(row.answer, 1500), embedText: `${row.question}\n${row.answer}` })
  },
  {
    table: "ds_medical_exam",
    dataset: "hcw0329/medical-korean-alpaca",
    license: "apache-2.0",
    map: (row) => ({
      id: "",
      title: cut(`[${row.input}] ${row.instruction}`, 120),
      body: cut(`${row.instruction}\n정답: ${row.output}`, 1500),
      embedText: `${row.input}\n${row.instruction}\n정답: ${row.output}`
    })
  },
  {
    table: "ds_industry_news",
    dataset: "podongchip/korean-synthetic-industry-news",
    license: "cc-by-4.0 (합성 데이터)",
    map: (row) => ({ id: row.id, title: cut(row.title, 300), body: cut(row.body, 1500), embedText: `${row.title}\n${row.body}` })
  },
  {
    table: "ds_finance_reports",
    dataset: "nmixx-fin/synthetic_financial_report_korean",
    license: "apache-2.0 (합성 데이터)",
    map: (row) => ({
      id: "",
      title: cut(`[${row.category}] ${row.text.trim()}`, 100),
      body: cut(row.text.trim(), 1500),
      embedText: `${row.category}\n${row.text}`
    })
  }
];

// 행 API 는 간헐적으로 502/429 를 낸다. 점점 늘려 가며 최대 6번 시도한다.
async function fetchJson(url) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (response?.ok) return response.json();
    if (attempt === 6) throw new Error(`${url} -> ${response ? response.status : "network error"}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
}

/** 데이터셋 전체에서 고르게 LIMIT 행을 뽑는다(앞쪽만 읽으면 정렬된 데이터가 한 과목으로 쏠린다). */
async function fetchRows(dataset) {
  const base = `https://datasets-server.huggingface.co`;
  const total = (await fetchJson(`${base}/size?dataset=${dataset}`)).size.dataset.num_rows;
  const pages = Math.max(1, Math.ceil(Math.min(LIMIT, total) / PAGE));
  const rows = [];
  for (let page = 0; page < pages; page += 1) {
    const offset = pages === 1 ? 0 : Math.floor((page * (total - PAGE)) / (pages - 1));
    const json = await fetchJson(`${base}/rows?dataset=${dataset}&config=default&split=train&offset=${offset}&length=${PAGE}`);
    rows.push(...json.rows.map((entry) => entry.row));
  }
  return rows.slice(0, LIMIT);
}

async function embed(texts) {
  const response = await fetch(`${EMBED_URL}/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(EMBED_API_KEY ? { authorization: `Bearer ${EMBED_API_KEY}` } : {}) },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(300_000)
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

const wanted = process.argv.slice(2);
for (const source of sources.filter((entry) => wanted.length === 0 || wanted.includes(entry.table))) {
  console.log(`== ${source.table} <- ${source.dataset} (${source.license})`);
  const raw = source.file
    ? (await (await fetch(source.file, { signal: AbortSignal.timeout(60_000) })).text()).trim().split("\n").map((line) => JSON.parse(line))
    : await fetchRows(source.dataset);
  const items = raw.map(source.map);

  const lines = [];
  for (let start = 0; start < items.length; start += 16) {
    const batch = items.slice(start, start + 16);
    const vectors = await embed(batch.map((item) => cut(item.embedText, 1200)));
    batch.forEach((item, index) => {
      lines.push([item.id, item.title, item.body, `[${vectors[index].join(",")}]`, `[${reduce(vectors[index]).join(",")}]`].map(csv).join(","));
    });
    process.stdout.write(`\r  embedded ${Math.min(start + 16, items.length)}/${items.length}`);
  }
  process.stdout.write("\n");

  await psql(`truncate table ${source.table} restart identity`);
  await psql(`\\copy ${source.table} (source_id, title, body, embedding, embedding_mrl) from stdin with (format csv)`, lines.join("\n") + "\n");
  console.log(`  loaded ${lines.length} rows`);
}
