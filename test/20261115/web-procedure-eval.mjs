// 웹 검색(덕덕고)에 연결된 프로시저 라우팅 측정: 질의 유형마다 기대 프로시저(들)가 상위 2개(라이브 설정)에 드는지.
//   node test/20261115/web-procedure-eval.mjs   (결과: 질의별 선택과 요약)
const set = [
  ["내일 서울 날씨랑 이번 주 미세먼지 어때?", ["실시간"]],
  ["지금 강남역 근처 교통 상황 어때?", ["실시간"]],
  ["이번 주말 제주 날씨 예보 알려줘", ["실시간"]],
  ["최근 AI 규제 관련 뉴스 정리해줘", ["최신 동향"]],
  ["요즘 반도체 업계 소식 알려줘", ["최신 동향"]],
  ["새로 나온 갤럭시 폴드 출시일이 언제야?", ["일정"]],
  ["콘서트 티켓 예매 일정이 언제 열려?", ["일정"]],
  ["지금 원달러 환율 얼마야?", ["시세"]],
  ["엔비디아 주가 지금 얼마인지 알려줘", ["시세"]],
  ["아이폰 16 프로 한국 가격이 얼마야?", ["시세", "제품"]],
  ["비타민D 먹으면 살 빠진다는 게 진짜야?", ["사실 확인"]],
  ["그 연예인 결혼설이 사실인지 확인해줘", ["사실 확인"]],
  ["30만원대 무선 이어폰 추천해줘", ["제품"]],
  ["노트북 살 때 어떤 게 가성비 좋아?", ["제품"]],
  ["다이슨 청소기 실제 사용 후기가 어때?", ["후기"]],
  ["이 호텔 평점이랑 장단점이 궁금해", ["후기"]],
  ["여권 재발급 어떻게 해?", ["방법"]],
  ["윈도우에서 화면 녹화하는 방법 알려줘", ["방법", "기술"]],
  ["제주도 3박 4일 여행 코스 추천해줘", ["장소"]],
  ["오사카 가면 꼭 가야 할 맛집이랑 영업시간 알려줘", ["장소"]],
  ["청년 월세 지원금 신청 자격이 어떻게 돼?", ["규정"]],
  ["올해 바뀐 연말정산 기준이 뭐야?", ["규정"]],
  ["양자 컴퓨터가 왜 암호를 깰 수 있다는 거야?", ["개념"]],
  ["인플레이션이 뭔지 쉽게 설명해줘", ["개념"]],
  ["파이썬에서 ModuleNotFoundError 해결 방법", ["기술"]],
  ["도커 컨테이너가 계속 재시작돼요 왜 그럴까요", ["기술"]],
  ["친구와 크게 다퉜는데 먼저 사과해야 할지 고민이에요.", ["조언"]],
  ["직장 상사와의 갈등 어떻게 대처하면 좋을까요", ["조언"]],
  ["두통이 며칠째 계속되는데 어떤 병원에 가야 해?", ["건강"]],
  ["이 약의 부작용이 뭐가 있어?", ["건강"]],
  ["일론 머스크는 어떤 회사들을 운영하고 있어?", ["인물"]],
  ["토스 회사가 언제 설립됐고 대표가 누구야?", ["인물"]],
  ["원전 확대를 둘러싼 찬반 논란을 정리해줘", ["쟁점"]],
  ["재택근무 의무화 논란에서 각 입장이 뭐야?", ["쟁점"]],
];
// PROC_MARGIN 이 있으면 저장하지 않은 설정으로(프로시저 단계의 margin 만 바꿔) 돌린다. 저장된 설정은 그대로.
const router = await (await fetch("http://127.0.0.1:18081/api/admin/router")).json();
const margin = process.env.PROC_MARGIN === undefined ? undefined : Number(process.env.PROC_MARGIN);
const config = margin === undefined ? undefined : { ...router, procedure: { steps: router.procedure.steps.map((step) => ({ ...step, margin })) } };
const rows = [];
for (const [query, expect] of set) {
  const r = await (await fetch("http://127.0.0.1:18081/api/admin/router/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, procedures: true, ...(config ? { config } : {}) }) })).json();
  const web = (r.procedures ?? []).find((p) => /덕덕고/.test(p.researcher));
  const picked = web?.selected ?? [];
  const top1 = picked[0] ?? "";
  const hit1 = expect.some((e) => top1.includes(e));
  const hit2 = picked.some((name) => expect.some((e) => name.includes(e)));
  rows.push({ query, expect, picked, hit1, hit2, webIncluded: Boolean(web), extra: picked.filter((name) => !expect.some((e) => name.includes(e))).length });
  console.log(hit1 ? "1위 " : hit2 ? "2위 " : "미스", `기대[${expect.join("/")}]`, "선택:", picked.map((n) => n.replace("[웹] ", "")).join(" , ") || "(없음)", "|", query);
}
const n = rows.length;
console.log(`margin=${margin ?? "라이브"} 선택 평균 ${(rows.reduce((s, x) => s + x.picked.length, 0) / n).toFixed(2)}, 기대 밖 선택 평균 ${(rows.reduce((s, x) => s + x.extra, 0) / n).toFixed(2)}`);
console.log(`질의 ${n}: 웹 포함 ${rows.filter((x) => x.webIncluded).length}, 1위 적중 ${rows.filter((x) => x.hit1).length}, 상위2 적중 ${rows.filter((x) => x.hit2).length}`);
