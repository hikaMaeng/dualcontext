// 배포된 서버(기본 라이터, 임베딩 라우터)에 분야별 질의를 보내 선택된 조사원 · 프로시저 · 근거를 기록한다.
//   node test/20261113/eval-queries.mjs > test/20261113/eval-queries_result.json
// 판정(expected 와 일치 여부)은 이 스크립트가 아니라 리포트에서 사람이 근거를 읽고 내린다.
import { Agent, fetch } from "undici";

const BASE = process.env.BASE ?? "http://127.0.0.1:18081/api/admin";
// /augment 는 최종 답변(추론 모델)까지 만들어 수 분이 걸린다. Node 기본 fetch 는 응답 헤더를 300초까지만 기다리므로
// 15분(900초)짜리 Agent 를 쓴다.
const patient = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 });

const cases = [
  { id: "law-term", query: "산지전용허가를 받아야 하는 경우와 그 예외는 무엇인가?", expectResearcher: "법률 용어 사전" },
  { id: "law-case", query: "형사소송법 제8조 사건의 직권이송에 대해 대법원은 어떻게 판단했나?", expectResearcher: "판례·법령 질의응답" },
  { id: "med-hepc", query: "만성 C형 간염으로 인터페론 치료 중인 45세 남성이 피로감과 근육통을 호소하면 어떻게 평가해야 하나?", expectResearcher: "의학 문제은행" },
  { id: "med-htn", query: "고혈압이 있고 혈중 칼륨이 낮은 환자에서 의심되는 질환은?", expectResearcher: "의학 문제은행" },
  { id: "news-power", query: "사우디 풍력 프로젝트에 투자한 국내 전력기업 소식이 있나?", expectResearcher: "산업 뉴스(합성)" },
  { id: "fin-gdp", query: "2분기 GDP 성장률 전망과 수출·내수 상황은 어때?", expectResearcher: "금융 시황 리포트(합성)" },
  { id: "fin-commodity", query: "원자재 투자가 주식과 채권보다 성과가 좋았던 시기는 언제인가?", expectResearcher: "금융 시황 리포트(합성)" },
  { id: "web-today", query: "오늘 서울 날씨는 어때?", expectResearcher: "웹 검색(덕덕고)" },
  { id: "out-of-scope", query: "김치찌개를 맛있게 끓이는 방법을 알려줘", expectResearcher: null }
];

const results = [];
for (const entry of cases) {
  const started = Date.now();
  const response = await fetch(`${BASE}/augment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: entry.query }),
    signal: AbortSignal.timeout(900_000),
    dispatcher: patient
  });
  const body = await response.json();
  const sources = [...body.context.matchAll(/- \[출처: (.{0,90})/g)].map((match) => match[1]);
  const gaps = body.context.split("## 부족한 항목")[1]?.trim().split("\n").filter((line) => line.startsWith("-")) ?? [];
  results.push({
    ...entry,
    http: response.status,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    routing: body.researcherRouting,
    pairs: body.pairs,
    topSources: sources.slice(0, 8),
    gaps
  });
}
console.log(JSON.stringify(results, null, 2));
