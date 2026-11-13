// 임베딩 라우팅의 최소 유사도 기준을 정하기 위해, 질의와 조사원 설명 사이의 코사인 유사도 분포를 잰다.
//   node test/20261113/routing-calibration.mjs > test/20261113/routing-calibration_result.json
// 양성: 실험 질의(E1b~E3b, F1~F3)와 그 질의가 기대한 조사원. 음성: 어떤 조사원과도 무관한 질의.
// 조사원 임베딩은 서버가 캐시한 값(researchers.embedding)을 DB 에서 그대로 읽는다(라우팅이 쓰는 값과 같다).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const EMBED_URL = process.env.EMBED_URL ?? "http://127.0.0.1:12345/v1";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "embeddinggemma2:mp";
const root = path.resolve("apps/dualcontext/seed-data/domains/_experiments");

const psql = (sql) =>
  execFileSync("docker", ["exec", "dualcontext", "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "dualcontext", "-tAF", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 1 << 26 });

const researchers = psql("select id, name, embedding::text from researchers order by id")
  .trim().split("\n").map((line) => {
    const [id, name, embedding] = line.split("\t");
    return { id: Number(id), name, vector: embedding.replace(/[{}]/g, "").split(",").map(Number) };
  });

async function embed(text) {
  const response = await fetch(`${EMBED_URL}/embeddings`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: EMBED_MODEL, input: [text] })
  });
  return (await response.json()).data[0].embedding;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / Math.sqrt(na * nb);
}

const positives = [];
for (const session of ["E1b", "E2b", "E3b", "F1", "F2", "F3"]) {
  const queries = JSON.parse(readFileSync(path.join(root, session, "queries.json"), "utf8"));
  for (const entry of queries.queries ?? queries) positives.push({ id: `${session}/${entry.id}`, query: entry.query, expect: entry.expect_researchers ?? [] });
}

// 어느 조사원과도 무관해야 하는 질의. 첫째는 실행 로그 #27 그대로다.
const negatives = [
  { id: 'N1(#27)', query: '빵 반죽을 손으로 치댈 때 글루텐이 생기는 과정을 쉽게 설명해 주세요. 반죽을 너무 오래 치대면 가정용 제빵에서 어떤 상태 변화를 살펴봐야 하나요?' },
  { id: 'N2', query: '김치찌개를 맛있게 끓이는 방법을 알려줘' },
  { id: 'N3', query: '강아지가 산책 중에 자꾸 멈추는데 어떻게 훈련하면 좋을까요?' },
  { id: 'N4', query: '여름휴가로 제주도에서 3박 4일 일정을 짜 주세요.' },
  { id: 'N5', query: '초등학교 3학년 아이에게 분수를 어떻게 가르치면 좋을까요?' },
  { id: 'N6', query: '베란다 화분의 잎이 누렇게 변하는 이유와 관리법이 궁금합니다.' },
  { id: 'N7', query: '오래된 청바지에 묻은 커피 얼룩을 집에서 지우는 방법이 있을까요?' },
  { id: 'N8', query: '친구와 크게 다퉜는데 먼저 사과해야 할지 고민이에요. 어떻게 말을 꺼내면 좋을까요?' },
  { id: 'N9', query: '주말 아침에 하기 좋은 가벼운 스트레칭 순서를 알려주세요.' },
  { id: 'N10', query: '결혼식 축사를 3분 분량으로 써 주세요. 신랑은 제 대학 동기입니다.' },
  { id: 'N11', query: '고양이가 밤마다 우는데 이유가 뭘까요? 중성화는 했습니다.' },
  { id: 'N12', query: '커피를 하루에 몇 잔까지 마셔도 되나요? 카페인이 수면에 미치는 영향도 궁금해요.' },
  { id: 'N13', query: '집에서 쉽게 만들 수 있는 수제 쿠키 레시피를 알려 주세요.' },
  { id: 'N14', query: '축구에서 오프사이드 규칙을 처음 보는 사람에게 설명해 주세요.' },
  { id: 'N15', query: '이사할 때 포장 이사와 일반 이사 중 어떤 걸 고르는 게 좋을까요?' },
  { id: 'N16', query: '기타를 처음 배우는데 손가락이 너무 아파요. 연습 요령이 있나요?' },
  { id: 'N17', query: '영어 면접에서 자기소개를 자연스럽게 하는 팁을 알려 주세요.' },
  { id: 'N18', query: '겨울철 실내 습도를 적당히 유지하는 방법이 궁금해요.' },
  { id: 'N19', query: '드럼 세탁기에서 곰팡이 냄새가 나요. 청소는 어떻게 하죠?' },
  { id: 'N20', query: '아이가 밤에 무서워서 혼자 못 자는데 어떻게 도와줘야 할까요?' },
  { id: 'N21', query: '달리기를 시작하려는데 무릎이 아프지 않게 하려면 어떻게 해야 해요?' },
  { id: 'N22', query: '한옥 마을에서 한복 체험을 하려면 예약은 언제쯤 해야 할까요?' },
  { id: 'N23', query: '와인 코르크가 부서졌을 때 병을 여는 방법을 알려 주세요.' },
  { id: 'N24', query: '수학 문제집에서 이차방정식의 근의 공식을 유도하는 과정을 보여 주세요.' }
];

// F3-4(제빵)는 설계상 범위 밖이라 음성으로 센다(처음에는 양성에 섞였다).
const OUT_OF_SCOPE = new Set(["F3/F3-4"]);
const rows = [];
for (const item of [...positives.map((p) => ({ ...p, kind: "positive" })), ...negatives.map((n) => ({ ...n, kind: "negative", expect: [] }))]) {
  const vector = await embed(item.query);
  const scores = researchers.map((r) => ({ name: r.name, score: Number(cosine(vector, r.vector).toFixed(4)) }));
  rows.push({ id: item.id, kind: OUT_OF_SCOPE.has(item.id) ? "negative" : item.kind, expect: item.expect, query: item.query.slice(0, 70), scores });
  process.stderr.write(`${item.id}\n`);
}

const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { n: sorted.length, min: sorted[0], p10: at(0.1), median: at(0.5), p90: at(0.9), max: sorted.at(-1) };
};

const expected = rows.filter((r) => r.kind === "positive").flatMap((r) => r.scores.filter((s) => r.expect.includes(s.name)).map((s) => s.score));
const extrasOfPositive = rows.filter((r) => r.kind === "positive").flatMap((r) => r.scores.filter((s) => !r.expect.includes(s.name)).map((s) => s.score));
const negativeAll = rows.filter((r) => r.kind === "negative").flatMap((r) => r.scores.map((s) => s.score));
const negativeBest = rows.filter((r) => r.kind === "negative").map((r) => Math.max(...r.scores.map((s) => s.score)));

const positiveRows = rows.filter((r) => r.kind === "positive");
const negativeRows = rows.filter((r) => r.kind === "negative");
const top = (r) => Math.max(...r.scores.map((s) => s.score));
const mean = (r) => r.scores.reduce((a, s) => a + s.score, 0) / r.scores.length;
const second = (r) => r.scores.map((s) => s.score).sort((a, b) => b - a)[1];
const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const names = [...new Set(rows.flatMap((r) => r.scores.map((s) => s.name)))];
const stat = Object.fromEntries(names.map((n) => { const v = rows.map((r) => r.scores.find((s) => s.name === n).score); return [n, [v.reduce((a, b) => a + b, 0) / v.length, sd(v)]]; }));
const zmax = (r) => Math.max(...r.scores.map((s) => (s.score - stat[s.name][0]) / stat[s.name][1]));
const auc = (f) => { let w = 0; for (const p of positiveRows) for (const n of negativeRows) { const a = f(p); const b = f(n); w += a > b ? 1 : a === b ? 0.5 : 0; } return Number((w / (positiveRows.length * negativeRows.length)).toFixed(3)); };
const expectedPairs = positiveRows.reduce((a, r) => a + r.expect.length, 0);
const thresholds = [0.65, 0.66, 0.67, 0.68, 0.7].map((t) => ({
  threshold: t,
  negativeNone: negativeRows.filter((r) => top(r) < t).length + "/" + negativeRows.length,
  positiveNone: positiveRows.filter((r) => top(r) < t).length + "/" + positiveRows.length,
  expectedPairsKept: positiveRows.reduce((a, r) => a + r.expect.filter((e) => r.scores.find((s) => s.name === e).score >= t).length, 0) + "/" + expectedPairs
}));
const summary = {
  positives: positiveRows.length,
  negatives: negativeRows.length,
  auc: { top: auc(top), topMinusMean: auc((r) => top(r) - mean(r)), topMinusSecond: auc((r) => top(r) - second(r)), zMax: auc(zmax) },
  thresholds,
  band_0_65_to_0_70: rows.filter((r) => top(r) >= 0.65 && top(r) < 0.7).length + "/" + rows.length
};

console.log(JSON.stringify({
  summary,
  note: "cosine(query, researcher routing embedding)",
  expectedResearchers: stats(expected),
  otherResearchersOnPositiveQueries: stats(extrasOfPositive),
  negativeQueries_allResearchers: stats(negativeAll),
  negativeQueries_bestPerQuery: negativeBest,
  rows
}, null, 2));
