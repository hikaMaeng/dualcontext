// 조사원 27개 상태에서 라우팅 선택 규칙을 비교한다(임베딩 코사인, 서버가 캐시한 조사원 임베딩 사용).
//   node test/20261115/routing-calibration27.mjs > test/20261115/routing-calibration27_result.json
// 질의는 조사원 설명이 아니라 사용자가 물을 법한 말로 직접 썼다(자료 행에서 따오지 않았다). 단일 질의 54 + 무관 12 + 복합 8.
import { execFileSync } from "node:child_process";
import { splitQuery } from "../../packages/dualcontext_domain/dist/server/index.js";

const EMBED_URL = process.env.EMBED_URL ?? "http://127.0.0.1:12345/v1";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "embeddinggemma2:mp";

const psql = (sql) => execFileSync("docker", ["exec", "dualcontext", "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "dualcontext", "-tAF", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 1 << 27 });
const researchers = psql("select id, name, embedding::text from researchers order by id").trim().split("\n").map((line) => {
  const [id, name, embedding] = line.split("\t");
  return { id: Number(id), name, vector: embedding.replace(/[{}]/g, "").split(",").map(Number) };
});

const embed = async (text) => (await (await fetch(`${EMBED_URL}/embeddings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: EMBED_MODEL, input: [text] }) })).json()).data[0].embedding;
const cosine = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i += 1) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };

// expect: 조사원 이름 일부. 둘 중 하나라도 선택되면 그 기대는 충족(대체 허용은 배열 안에 같이 적는다).
const single = [
  ["법률 용어", "법인의 합병과 소멸, 승계가 법률적으로 무슨 뜻인가요?"], ["법률 용어", "'선의'와 '악의'라는 법률 용어는 일상 용어와 어떻게 다른가요?"],
  ["판례", "대법원은 근로기준법의 휴업수당 조문을 어떻게 해석했나요?"], ["판례", "민법 제750조 불법행위에 관한 대법원 판결의 쟁점은 무엇인가요?"],
  ["의학", "밤에 기침이 악화되는 23세 여성 환자의 진단과 치료는?"], ["의학", "혈중 호산구가 증가한 천식 환자에서 다음에 할 검사로 적절한 것은?"],
  ["산업 뉴스", "반도체 공급망 차질이 국내 기업의 생산에 미친 영향을 알려줘"], ["산업 뉴스", "클라우드 업계의 규제와 투자 동향이 산업에 어떤 영향을 주나요?"],
  ["금융 시황", "미국 구인 건수 발표 후 코스피와 환율이 어떻게 움직였나요?"], ["금융 시황", "증권사 리포트가 본 이번 주 금리 전망과 증시 방향은?"],
  ["웹 검색", "오늘 서울 날씨와 이번 주 예보가 어때요?"], ["웹 검색", "지금 원달러 환율과 최신 뉴스 헤드라인을 알려줘"],
  ["AI 머신러닝", "활성값 희소화로 LLM 추론 효율을 높인 논문이 있나요?"], ["AI 머신러닝", "양자화 모델의 정확도 손실을 줄이는 최근 연구 방법은?"],
  ["GPU", "RTX 5090의 VRAM과 소비전력은 얼마인가요?"], ["GPU", "Radeon HD 6670과 GeForce 8600 GTS의 메모리 대역폭을 비교해줘"],
  ["미국 기업 산업", "미국 대형 에너지 기업의 최근 분기 실적과 산업 동향은?"], ["미국 기업 산업", "S&P 500 기업 뉴스에서 제약 업종 흐름이 어떻게 보도됐나요?"],
  ["CVE", "CVE-2024-21709 의 영향받는 제품과 공격 조건은?"], ["CVE", "PHP 웹 애플리케이션의 SQL 인젝션 취약점 최근 CVE 현황은?"],
  ["소프트웨어 개발", "C#에서 Decimal을 Double로 변환할 때 오류가 나는 이유는?"], ["소프트웨어 개발", "LINQ로 페이징을 구현하는 방법을 알려줘"],
  ["요리", "빵 반죽을 치댈 때 글루텐이 어떻게 생기나요?"], ["요리", "김치에 하얀 곰팡이가 피었는데 먹어도 되나요?"],
  ["육아", "중학생 아이의 사춘기 반항을 어떻게 대해야 하나요?"], ["육아", "아기가 밤에 자주 깨는데 수면 교육은 어떻게 하죠?"],
  ["생활 건강", "요즘 두통이 잦은데 병원에 가야 할까요?"], ["생활 건강", "비타민D 영양제는 언제 먹는 게 좋나요?"],
  ["재테크", "ETF와 펀드의 차이가 뭐고 어느 쪽이 유리한가요?"], ["재테크", "연말정산에서 월세 세액공제를 받으려면 어떻게 하나요?"],
  ["생활·노동 법률", "퇴직금은 어떻게 계산하고 언제까지 받아야 하나요?"], ["생활·노동 법률", "전세 보증금을 돌려받지 못할 때 어떤 절차가 있나요?"],
  ["여행", "일본 3박 4일 여행 준비물과 항공권 예약 팁은?"], ["여행", "캠핑이 처음인데 준비해야 할 장비 목록이 궁금해요"],
  ["PC", "엑셀에서 중복된 값을 한 번에 지우는 방법은?"], ["PC", "포토샵에서 사진 두 장을 하나로 합치는 순서를 알려줘"],
  [["역사·문화", "한국사"], "'울며 겨자 먹기'라는 속담의 유래가 뭐예요?"], [["역사·문화", "한국사"], "조선시대 과거제도는 어떻게 운영되었나요?"],
  ["과학", "하늘이 파랗게 보이는 원리가 뭐예요?"], ["과학", "전자레인지는 어떻게 음식을 데우나요?"],
  [["한국사", "역사·문화"], "신돈이 설치한 전민변정도감은 어떤 기관이었나요?"], [["한국사", "역사·문화"], "대한제국 시기 광무개혁의 내용은 무엇이었나요?"],
  ["심리", "로저스 인간중심상담의 핵심 개념은 무엇인가요?"], ["심리", "수퍼의 진로발달 이론에서 단계는 어떻게 나뉘나요?"],
  ["경제·회계", "회계에서 발생주의와 현금주의는 어떻게 다른가요?"], ["경제·회계", "금융실명제에서 대리인이 계좌를 개설할 때 필요한 서류는?"],
  ["부동산", "공인중개사가 임대차 계약에서 설명해야 할 사항은?"], ["부동산", "주택법상 하자보수 책임 기간은 어떻게 되나요?"],
  ["환경", "수질오염 공정시험법에서 질산성 질소는 어떻게 측정하나요?"], ["환경", "대기오염물질 처리에 쓰는 집진 장치의 종류는?"],
  ["농업", "벼 재배에서 질소 비료를 과하게 주면 어떤 문제가 생기나요?"], ["농업", "토양 중금속 오염을 식물로 정화하는 방법은?"],
  ["에너지", "보일러 급수 처리에서 가성취화를 막는 방법은?"], ["에너지", "신재생에너지 중 태양열과 태양광의 효율 차이는?"]
].map(([expect, query]) => ({ kind: "single", expect: [Array.isArray(expect) ? expect : [expect]], query }));

const negatives = [
  "강아지가 산책 중에 자꾸 멈추는데 어떻게 훈련하면 좋을까요?", "베란다 화분의 잎이 누렇게 변하는 이유와 관리법이 궁금합니다.", "오래된 청바지에 묻은 커피 얼룩을 지우는 방법이 있을까요?",
  "친구와 크게 다퉜는데 먼저 사과해야 할지 고민이에요.", "초등학교 3학년 아이에게 분수를 어떻게 가르치면 좋을까요?", "자동차 엔진오일은 몇 km마다 갈아야 하나요?",
  "축구에서 오프사이드 규칙을 쉽게 설명해 주세요.", "피아노를 처음 배우려면 어떤 곡부터 시작하는 게 좋을까요?", "고양이 털이 너무 많이 빠지는데 어떻게 관리하나요?",
  "이사 갈 집의 인테리어 색상은 어떻게 고르면 좋을까요?", "결혼식 축의금은 보통 얼마를 내나요?", "영어 회화 실력을 빨리 늘리는 공부법을 알려줘"
].map((query) => ({ kind: "negative", expect: [], query }));

const composite = [
  [["법률 용어"], ["산업 뉴스"], "법인 합병이 무슨 뜻인지 설명해 주세요. 그리고 반도체 공급 차질이 기업 생산에 준 영향도 알려주세요."],
  [["육아"], ["재테크"], "사춘기 아이를 어떻게 대해야 하는지 조언해 주세요. 별도로 연말정산 월세 세액공제 방법도 알려주세요."],
  [["GPU"], ["CVE"], "RTX 5090의 소비전력은 얼마인지, 그리고 CVE-2024-21709 의 공격 조건은 무엇인지 알려줘"],
  [["요리"], ["과학"], "빵 반죽 글루텐이 어떻게 생기는지 설명해 주세요. 그리고 하늘이 파란 이유도 알려주세요."],
  [["판례"], ["생활·노동 법률"], "휴업수당 판례는 어떤 판단을 했는지, 퇴직금 계산 방법은 무엇인지 알려주세요"],
  [["금융 시황"], ["여행"], "코스피와 환율 움직임은 어땠는지, 일본 여행 준비물은 뭐가 필요한지 알려주세요"],
  [["소프트웨어 개발"], ["AI 머신러닝"], "LINQ 페이징 구현 방법을 알려줘, 그리고 활성값 희소화로 추론 효율을 높인 논문의 요지도 알려줘"],
  [["역사·문화", "한국사"], ["생활·노동 법률"], "조선 과거제도가 어떻게 운영됐는지, 전세 보증금 반환 절차는 어떻게 되는지 알려주세요"]
].map(([a, b, query]) => ({ kind: "composite", expect: [a, b], query }));

const items = [...single, ...negatives, ...composite];
const scoreOf = async (text) => { const v = await embed(text); return researchers.map((r) => ({ id: r.id, name: r.name, score: cosine(v, r.vector) })).sort((x, y) => y.score - x.score); };

for (const item of items) {
  item.scores = await scoreOf(item.query);
  item.parts = splitQuery(item.query);
  item.partScores = item.parts.length > 1 ? await Promise.all(item.parts.map(scoreOf)) : [];
  process.stderr.write(".");
}
process.stderr.write("\n");

const hit = (names, picked) => picked.some((p) => names.some((n) => p.name.includes(n)));

/** 규칙: 통째 질의는 (min, topK, margin), 하위 질문은 (partMin, partTop). 합집합으로 선택. */
function select(item, rule) {
  const pick = (scores, min, top, margin) => { const best = scores[0].score; return scores.filter((s) => s.score >= min && s.score >= best - margin).slice(0, top); };
  const chosen = new Map();
  for (const s of pick(item.scores, rule.min, rule.topK, rule.margin ?? 1)) chosen.set(s.id, s);
  if (rule.parts && item.partScores.length > 0) for (const scores of item.partScores) for (const s of pick(scores, rule.partMin ?? rule.min, rule.partTop ?? 1, rule.partMargin ?? 1)) chosen.set(s.id, s);
  return [...chosen.values()];
}

function evaluate(rule) {
  const out = { rule, single: { recall: 0, n: 0, avgSelected: 0 }, negative: { none: 0, n: 0, avgSelected: 0 }, composite: { recall: 0, n: 0, avgSelected: 0, both: 0 } };
  for (const item of items) {
    const picked = select(item, rule);
    const bucket = out[item.kind];
    bucket.n += 1;
    bucket.avgSelected += picked.length;
    if (item.kind === "negative") bucket.none += picked.length === 0 ? 1 : 0;
    else {
      const hits = item.expect.filter((names) => hit(names, picked)).length;
      bucket.recall += hits / item.expect.length;
      if (item.kind === "composite") bucket.both += hits === item.expect.length ? 1 : 0;
    }
  }
  for (const bucket of [out.single, out.negative, out.composite]) {
    bucket.avgSelected = Number((bucket.avgSelected / bucket.n).toFixed(2));
    if ("recall" in bucket) bucket.recall = Number((bucket.recall / bucket.n).toFixed(3));
  }
  return out;
}

const top1 = single.filter((item) => hit(item.expect[0], [item.scores[0]])).length;
const rules = [];
for (const min of [0.67, 0.70, 0.72, 0.74, 0.76]) for (const margin of [1, 0.08, 0.05, 0.03]) rules.push({ min, topK: 3, margin, parts: false });
for (const partMin of [0.67, 0.70, 0.72, 0.74]) for (const partTop of [1, 2]) rules.push({ min: 0.70, topK: 3, margin: 0.05, parts: true, partMin, partTop, partMargin: 0.05 });
const results = rules.map(evaluate);

console.log(JSON.stringify({
  researchers: researchers.length, queries: { single: single.length, negative: negatives.length, composite: composite.length },
  top1Single: `${top1}/${single.length}`,
  misses: single.filter((item) => !hit(item.expect[0], [item.scores[0]])).map((item) => ({ query: item.query, expect: item.expect[0], top3: item.scores.slice(0, 3).map((s) => `${s.name}:${s.score.toFixed(3)}`) })),
  negativeTop: negatives.map((item) => ({ query: item.query, top: `${item.scores[0].name}:${item.scores[0].score.toFixed(3)}` })),
  results
}, null, 1));
