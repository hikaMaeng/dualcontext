// 1단계(조사원 선택)를 LLM 방식으로 돌렸을 때의 정확도와 지연을 잰다. routing-heldout.mjs 와 같은 질의 · 같은 라벨이다.
//   node test/20261113/routing-llm-eval.mjs > test/20261113/routing-llm-eval_result.json
// 서버 라우터와 같은 프롬프트(router_config.researcher_prompt)와 같은 후보 줄 형식(`id=.. | 이름 | 설명`)을 쓴다.
import { Agent, fetch } from "undici";

const ADMIN = process.env.ADMIN_URL ?? "http://127.0.0.1:18081/api/admin";
const LLM_URL = process.env.LLM_URL ?? "http://127.0.0.1:18180/v1";
const LLM_MODEL = process.env.LLM_MODEL ?? "qwen36-35b";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);
const patient = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 });

const cases = [
  { id: "P1", query: "GPU 의 VRAM 용량과 메모리 대역폭이 대규모 모델 학습 속도에 어떤 영향을 주는지 설명해 주세요.", expect: ["GPU Ark"] },
  { id: "P2", query: "CVE 취약점의 CVSS 점수는 어떻게 해석하고, 영향 받는 제품의 수정 범위는 어떻게 확인하나요?", expect: ["CVE"] },
  { id: "P3", query: "파이썬에서 예외 처리 시 try except finally 블록의 실행 순서와 흔한 실수가 궁금합니다.", expect: ["소프트웨어 개발"] },
  { id: "P4", query: "트랜스포머 모델의 어텐션 연산 비용을 줄이는 최근 연구 기법들을 비교해 주세요.", expect: ["AI 머신러닝"] },
  { id: "P5", query: "코스피가 하락한 날 금리와 환율 전망은 보통 어떻게 설명되나요?", expect: ["금융 시황"] },
  { id: "P6", query: "반도체 공급 부족이 서버 업체의 계약 성사율과 매출에 미치는 영향을 알고 싶어요.", expect: ["산업 뉴스", "금융 시황", "미국 기업"] },
  { id: "P7", query: "환자가 지속적인 기침과 호흡곤란을 호소할 때 감별해야 할 질환과 검사는 무엇인가요?", expect: ["의학 문제은행"] },
  { id: "P8", query: "회사가 합병되어 소멸하는 경우 소멸 법인의 권리와 의무는 어떻게 승계되나요?", expect: ["법률 용어", "판례"] },
  { id: "P9", query: "사건의 직권이송에 관한 대법원 판례의 판단 기준을 알려 주세요.", expect: ["판례"] },
  { id: "P10", query: "미국 상장 기업이 사업부를 분사하겠다고 발표한 사례와 그 배경을 알려 주세요.", expect: ["미국 기업", "산업 뉴스"] },
  { id: "P11", query: "오늘 서울의 날씨와 현재 달러 환율을 알려 주세요.", expect: ["웹 검색"] },
  { id: "P12", query: "최신 그래픽카드 신제품의 출시일과 현재 판매 가격이 궁금합니다.", expect: ["웹 검색", "GPU Ark"] },
  { id: "X1", query: "도자기 그릇을 가마에 구울 때 온도 곡선은 어떻게 잡아야 하나요?", none: true },
  { id: "X2", query: "중학생 아이의 사춘기 반항을 어떻게 대해야 할지 조언해 주세요.", none: true },
  { id: "X3", query: "수채화에서 번짐 효과를 내려면 물 조절을 어떻게 하나요?", none: true },
  { id: "X4", query: "신혼부부에게 어울리는 집들이 선물을 추천해 주세요.", none: true },
  { id: "X5", query: "마라톤 풀코스를 완주하기 위한 12주 훈련 계획을 짜 주세요.", none: true },
  { id: "X6", query: "자동차 엔진에서 달그락거리는 소리가 나는데 원인이 뭘까요?", none: true },
  { id: "X7", query: "소설 도입부에서 독자의 흥미를 끄는 문장을 쓰는 요령이 있나요?", none: true },
  { id: "X8", query: "비 오는 날 우산 없이 젖지 않으려면 어떻게 걸어야 효과적일까요?", none: true },
  { id: "X9", query: "겨울철 고구마를 오래 보관하는 방법을 알려 주세요.", none: true },
  { id: "X10", query: "요가 초보자가 하루 10분으로 유연성을 기르는 루틴을 알려 주세요.", none: true },
  { id: "X11", query: "여행 중 현지 시장에서 흥정을 잘하는 요령이 있을까요?", none: true },
  { id: "X12", query: "손으로 쓴 글씨를 예쁘게 만드는 연습법을 알려 주세요.", none: true }
];

const get = async (path) => (await fetch(`${ADMIN}${path}`)).json();
const router = await get("/router");
const researchers = (await get("/researchers")).filter((researcher) => researcher.enabled);
const candidateLines = researchers.map((r) => `id=${r.id} | ${r.name} | ${r.description}`).join("\n");

const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_m, key) => values[key] ?? "");

async function ask(query) {
  const prompt = fill(router.researcherPrompt, { query, topK: String(router.researcherTopK), candidates: candidateLines });
  const started = Date.now();
  const response = await fetch(`${LLM_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: LLM_MODEL, temperature: 0, messages: [{ role: "user", content: prompt }] }),
    dispatcher: patient,
    signal: AbortSignal.timeout(900_000)
  });
  const json = await response.json();
  const answer = String(json.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const ids = [...new Set((answer.match(/\d+/g) ?? []).map(Number).filter((id) => researchers.some((r) => r.id === id)))].slice(0, router.researcherTopK);
  const emptyAnswer = ids.length === 0 && /\[\s*\]/.test(answer);
  return { answer: answer.slice(0, 120), ids, emptyAnswer, unparsed: ids.length === 0 && !emptyAnswer, seconds: Math.round((Date.now() - started) / 100) / 10 };
}

const rows = [];
let next = 0;
async function worker() {
  while (next < cases.length) {
    const entry = cases[next++];
    const result = await ask(entry.query);
    const names = result.ids.map((id) => researchers.find((r) => r.id === id).name);
    const chosenNothing = result.ids.length === 0;
    const ok = entry.none ? chosenNothing && !result.unparsed : !chosenNothing && entry.expect.some((name) => names.some((chosen) => chosen.includes(name)));
    rows.push({ id: entry.id, kind: entry.none ? "negative" : "positive", ok, chosen: names, answer: result.answer, unparsed: result.unparsed, seconds: result.seconds });
    process.stderr.write(`${entry.id} ${ok ? "ok" : "MISS"} ${result.seconds}s\n`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
rows.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
const seconds = rows.map((row) => row.seconds).sort((a, b) => a - b);
console.log(JSON.stringify({
  method: "llm (stage 1 only)", model: LLM_MODEL, concurrency: CONCURRENCY, topK: router.researcherTopK,
  positives: { total: rows.filter((r) => r.kind === "positive").length, ok: rows.filter((r) => r.kind === "positive" && r.ok).length },
  negatives: { total: rows.filter((r) => r.kind === "negative").length, ok: rows.filter((r) => r.kind === "negative" && r.ok).length },
  seconds: { min: seconds[0], median: seconds[Math.floor(seconds.length / 2)], max: seconds.at(-1) },
  rows
}, null, 2));
