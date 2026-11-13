// 자료(행) 단위 관련도 기준을 정하기 위해, 실행 로그의 (질의, 선택된 조사원)마다 저장된 행과 질의의 코사인 유사도를 잰다.
//   node test/20261113/material-relevance.mjs <runs 디렉터리> > test/20261113/material-relevance_result.json
// 라벨(rel 관련 / part 부분 / irr 무관)은 실행 로그 건별 서브에이전트(#6~#36)가 수집된 자료 내용을 읽고 낸 판정이다.
// 사람이 검증한 정답이 아니다. 판정이 갈린 건은 part 로 두고 분리도 계산에서 뺀다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const EMBED_URL = process.env.EMBED_URL ?? "http://127.0.0.1:12345/v1";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "embeddinggemma2:mp";
const runsDir = process.argv[2];

const tables = {
  "법률 용어 사전": "ds_legal_terms", "판례·법령 질의응답": "ds_legal_cases", "의학 문제은행": "ds_medical_exam",
  "산업 뉴스(합성)": "ds_industry_news", "금융 시황 리포트(합성)": "ds_finance_reports", "AI 머신러닝 연구 논문 초록": "ds_ai_research",
  "GPU Ark 그래픽카드 사양": "ds_gpu_hardware", "미국 기업 산업 동향 기사": "ds_industry_tech", "CVE 취약점과 영향 정보": "ds_it_security",
  "소프트웨어 개발 질의응답": "ds_software_dev"
};

// run → [조사원, 라벨]
const labels = {
  6: [["산업 뉴스(합성)", "part"], ["금융 시황 리포트(합성)", "irr"]],
  7: [["금융 시황 리포트(합성)", "part"], ["산업 뉴스(합성)", "irr"]],
  8: [["의학 문제은행", "rel"], ["산업 뉴스(합성)", "rel"]],
  9: [["금융 시황 리포트(합성)", "rel"], ["산업 뉴스(합성)", "irr"]],
  10: [["금융 시황 리포트(합성)", "rel"], ["산업 뉴스(합성)", "irr"], ["판례·법령 질의응답", "irr"]],
  11: [["산업 뉴스(합성)", "rel"], ["금융 시황 리포트(합성)", "rel"]],
  12: [["산업 뉴스(합성)", "rel"], ["금융 시황 리포트(합성)", "irr"]],
  13: [["금융 시황 리포트(합성)", "part"], ["산업 뉴스(합성)", "irr"], ["판례·법령 질의응답", "irr"]],
  14: [["산업 뉴스(합성)", "part"], ["금융 시황 리포트(합성)", "irr"]],
  15: [["법률 용어 사전", "rel"], ["판례·법령 질의응답", "irr"]],
  16: [["산업 뉴스(합성)", "irr"], ["의학 문제은행", "irr"]],
  17: [["산업 뉴스(합성)", "rel"], ["금융 시황 리포트(합성)", "rel"], ["법률 용어 사전", "rel"]],
  18: [["의학 문제은행", "rel"], ["판례·법령 질의응답", "irr"]],
  19: [["GPU Ark 그래픽카드 사양", "rel"], ["AI 머신러닝 연구 논문 초록", "part"]],
  20: [["GPU Ark 그래픽카드 사양", "rel"], ["CVE 취약점과 영향 정보", "irr"]],
  21: [["GPU Ark 그래픽카드 사양", "part"], ["산업 뉴스(합성)", "irr"]],
  22: [["GPU Ark 그래픽카드 사양", "rel"], ["AI 머신러닝 연구 논문 초록", "part"], ["산업 뉴스(합성)", "irr"]],
  23: [["GPU Ark 그래픽카드 사양", "rel"], ["소프트웨어 개발 질의응답", "irr"], ["산업 뉴스(합성)", "irr"]],
  24: [["CVE 취약점과 영향 정보", "rel"], ["소프트웨어 개발 질의응답", "part"], ["판례·법령 질의응답", "irr"]],
  25: [["CVE 취약점과 영향 정보", "irr"], ["소프트웨어 개발 질의응답", "irr"], ["산업 뉴스(합성)", "irr"]],
  26: [["AI 머신러닝 연구 논문 초록", "part"], ["판례·법령 질의응답", "irr"], ["소프트웨어 개발 질의응답", "irr"]],
  27: [["소프트웨어 개발 질의응답", "irr"], ["의학 문제은행", "irr"], ["미국 기업 산업 동향 기사", "irr"]],
  28: [["CVE 취약점과 영향 정보", "rel"], ["소프트웨어 개발 질의응답", "rel"]],
  29: [["AI 머신러닝 연구 논문 초록", "part"], ["소프트웨어 개발 질의응답", "irr"], ["판례·법령 질의응답", "irr"]],
  30: [["소프트웨어 개발 질의응답", "part"], ["판례·법령 질의응답", "irr"], ["AI 머신러닝 연구 논문 초록", "irr"]],
  31: [["금융 시황 리포트(합성)", "part"], ["미국 기업 산업 동향 기사", "irr"], ["산업 뉴스(합성)", "irr"]],
  34: [["산업 뉴스(합성)", "rel"], ["미국 기업 산업 동향 기사", "irr"], ["금융 시황 리포트(합성)", "irr"]],
  36: [["소프트웨어 개발 질의응답", "irr"]]
};

const psql = (sql) => execFileSync("docker", ["exec", "-i", "dualcontext", "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "dualcontext", "-tA"], { encoding: "utf8", input: sql, maxBuffer: 1 << 26 });

async function embed(text) {
  const response = await fetch(`${EMBED_URL}/embeddings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: EMBED_MODEL, input: [text] }) });
  return (await response.json()).data[0].embedding;
}

const rows = [];
for (const [run, list] of Object.entries(labels)) {
  const query = JSON.parse(readFileSync(path.join(runsDir, `${run}.json`), "utf8")).query;
  const vector = `[${(await embed(query)).join(",")}]`;
  for (const [researcher, label] of list) {
    const table = tables[researcher];
    const sims = psql(`select round((1 - (embedding <=> '${vector}'::vector))::numeric, 4) from ${table} order by embedding <=> '${vector}'::vector limit 3`).trim().split("\n").map(Number);
    rows.push({ run: Number(run), researcher, label, top1: sims[0], top3mean: Number((sims.reduce((a, b) => a + b, 0) / sims.length).toFixed(4)), sims });
    process.stderr.write(`${run} ${researcher} ${label} ${sims[0]}\n`);
  }
}

const by = (label, key) => rows.filter((r) => r.label === label).map((r) => r[key]).sort((a, b) => a - b);
const auc = (key) => {
  const pos = rows.filter((r) => r.label === "rel"), neg = rows.filter((r) => r.label === "irr");
  let w = 0;
  for (const p of pos) for (const n of neg) w += p[key] > n[key] ? 1 : p[key] === n[key] ? 0.5 : 0;
  return Number((w / (pos.length * neg.length)).toFixed(3));
};
const thresholds = [0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72].map((t) => ({
  threshold: t,
  irrelevantDropped: `${rows.filter((r) => r.label === "irr" && r.top1 < t).length}/${rows.filter((r) => r.label === "irr").length}`,
  relevantDropped: `${rows.filter((r) => r.label === "rel" && r.top1 < t).length}/${rows.filter((r) => r.label === "rel").length}`,
  partialDropped: `${rows.filter((r) => r.label === "part" && r.top1 < t).length}/${rows.filter((r) => r.label === "part").length}`
}));
console.log(JSON.stringify({ note: "자료(행) 단위: 질의와 조사원 테이블 상위 3개 행의 코사인 유사도. 라벨은 서브에이전트 판정(미검증).", auc: { top1: auc("top1"), top3mean: auc("top3mean") }, top1: { rel: by("rel", "top1"), part: by("part", "top1"), irr: by("irr", "top1") }, thresholds, rows }, null, 1));
