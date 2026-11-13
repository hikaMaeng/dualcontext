// 최소 유사도 기준(0.67)을 정할 때 쓰지 않은 새 질의로 라우팅 판정을 검증한다(held-out).
//   node test/20261113/routing-heldout.mjs > test/20261113/routing-heldout_result.json
// 라벨은 실행 전에 고정했다: expect = 컨텍스트에 나와야 하는 조사원 이름의 일부(하나라도), none = 컨텍스트가 비어야 한다.
// MCP 도구 augment_context 를 stdio 로 호출한다(LLM 답변은 만들지 않는다).
import { spawn } from "node:child_process";

const cases = [
  // ---- 마땅한 조사원이 있는 질의(양성) ----
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
  // ---- 마땅한 조사원이 없는 질의(음성): 컨텍스트가 비어야 한다 ----
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

function mcpContext(query) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", "dualcontext", "node", "/app/dist/server/index.js", "--stdio"], { stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("mcp timeout")); }, 240_000);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      for (const line of out.split("\n")) {
        if (!line.trim().startsWith("{")) continue;
        const message = JSON.parse(line);
        if (message.id === 2) {
          clearTimeout(timer);
          child.stdin.end();
          resolve({ content: message.result.content ?? [], isError: message.result.isError ?? false });
        }
      }
    });
    child.on("error", reject);
    const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "heldout", version: "0" } } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "augment_context", arguments: { query } } });
  });
}

const rows = [];
for (const entry of cases) {
  const { content, isError } = await mcpContext(entry.query);
  const text = content.map((block) => block.text ?? "").join("\n");
  const researchers = [...text.matchAll(/^## 조사원: (.+?) \//gm)].map((match) => match[1]);
  const suppliedNothing = content.length === 0 || text.trim() === "";
  const ok = entry.none ? suppliedNothing : !suppliedNothing && entry.expect.some((name) => researchers.some((found) => found.includes(name)));
  rows.push({ id: entry.id, kind: entry.none ? "negative" : "positive", query: entry.query.slice(0, 60), suppliedNothing, researchers: [...new Set(researchers)], expect: entry.expect ?? null, ok, isError });
  process.stderr.write(`${entry.id} ${ok ? "ok" : "MISS"}\n`);
}
const pos = rows.filter((row) => row.kind === "positive");
const neg = rows.filter((row) => row.kind === "negative");
console.log(JSON.stringify({
  criterion: "positive: context non-empty and contains an expected researcher; negative: context empty",
  positives: { total: pos.length, ok: pos.filter((row) => row.ok).length },
  negatives: { total: neg.length, ok: neg.filter((row) => row.ok).length },
  rows
}, null, 2));
