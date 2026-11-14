// 일상 Q&A(KoAlpaca) 분야 테이블에서, 맞는 질의와 무관한 질의의 상위 행 유사도 분포를 잰다(자료 단위 minScore 기준용).
//   node test/20261115/row-score-everyday.mjs > test/20261115/row-score-everyday_result.json
// 양성: routing-calibration27 의 단일 질의 중 기대 조사원이 일상 Q&A 분야인 것. 음성: 같은 파일의 무관 질의 12개.
// 각 질의 × 각 일상 Q&A 테이블의 최고 코사인(전체 차원)을 잰다. 양성은 기대 테이블, 음성은 모든 테이블이 대상이다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EMBED_URL = process.env.EMBED_URL ?? "http://127.0.0.1:12345/v1";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "embeddinggemma2:mp";
const tables = { "요리": "ds_life_cooking", "육아": "ds_parenting_teen", "생활 건강": "ds_health_life", "재테크": "ds_money_basics", "생활·노동 법률": "ds_life_law", "여행": "ds_travel_leisure", "PC": "ds_pc_howto", "역사·문화": "ds_culture_history", "과학": "ds_science_general" };

const calibration = JSON.parse(readFileSync("test/20261115/routing-calibration27_result.json", "utf8"));
const source = readFileSync("test/20261115/routing-calibration27.mjs", "utf8");
// 질의 원문은 결과 파일에 expect 가 없는 단일 질의가 없으므로, 스크립트의 단일 질의 표를 그대로 읽는다.
const singles = [...source.matchAll(/\[\s*(\[[^\]]*\]|"[^"]*"),\s*"([^"]+)"\s*\]/g)].map((m) => ({ expect: m[1].replace(/[\["\]]/g, "").split(",").map((v) => v.trim()), query: m[2] }));

const embed = async (text) => (await (await fetch(`${EMBED_URL}/embeddings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: EMBED_MODEL, input: [text] }) })).json()).data[0].embedding;
const top = (table, vector) => Number(execFileSync("docker", ["exec", "-i", "dualcontext", "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "dualcontext", "-tA"], { input: `select max(1 - (embedding <=> '[${vector.join(",")}]'::vector)) from ${table}`, encoding: "utf8" }).trim());

const positives = [];
for (const item of singles) {
  const name = Object.keys(tables).find((key) => item.expect.length === 1 && item.expect[0] === key);
  if (name) positives.push({ query: item.query, table: tables[name], score: top(tables[name], await embed(item.query)) });
}
const negatives = [];
for (const entry of calibration.negativeTop) {
  const vector = await embed(entry.query);
  negatives.push({ query: entry.query, scores: Object.fromEntries(Object.values(tables).map((table) => [table, top(table, vector)])) });
}

const negMax = negatives.map((entry) => Math.max(...Object.values(entry.scores)));
const posScores = positives.map((entry) => entry.score);
const sweep = [0.72, 0.74, 0.76, 0.78, 0.80, 0.82].map((threshold) => ({
  threshold,
  positivesKept: `${posScores.filter((score) => score >= threshold).length}/${posScores.length}`,
  negativesEmpty: `${negMax.filter((score) => score < threshold).length}/${negMax.length}`
}));
console.log(JSON.stringify({ positives, negatives, negMax: negMax.map((v) => Number(v.toFixed(4))), posMin: Math.min(...posScores), sweep }, null, 1));
