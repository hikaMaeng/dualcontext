// 덕덕고 외 조사원의 프로시저 라우팅을 margin 별로 비교: 대상 조사원에 연결된 프로시저 중 기대 프로시저가 상위에 드는지,
// 질의당 선택 수가 어떻게 달라지는지. 라벨(질의 · 대상 조사원 · 기대 프로시저 이름 조각)은 이 파일에서 직접 만든 것이다.
//   PROC_MARGIN=0.03 node test/20261115/procedure-margin-others-eval.mjs
const set = [
  ["합병이 법적으로 어떤 의미인지 정의해줘", "법률 용어", ["용어 정의"]],
  ["소멸시효가 뭔지 뜻을 알려줘", "법률 용어", ["용어 정의"]],
  ["대법원이 이 조문을 어떻게 해석했는지 판례로 알려줘", "판례·법령", ["판례-법령"]],
  ["최근 반도체 업계 이슈가 시장에 미치는 영향 분석해줘", "산업 뉴스", ["영향 분석", "시황"]],
  ["이번 분기 금융 시황을 요약해줘", "금융 시황", ["시황"]],
  ["RTX 4070과 4080의 사양 차이를 비교해줘", "GPU Ark", ["사양과 세대"]],
  ["이 그래픽카드를 꽂으려면 전원 파워가 몇 와트 필요해?", "GPU Ark", ["전원 조건", "전력"]],
  ["영상 편집 작업에 맞는 GPU가 어떤 거야?", "GPU Ark", ["작업별"]],
  ["이 취약점의 심각도가 얼마나 높은지 알려줘", "CVE", ["심각도"]],
  ["영향받는 제품 버전과 패치 범위가 어떻게 돼?", "CVE", ["취약 제품"]],
  ["파이썬에서 KeyError가 나는 원인이 뭐야?", "소프트웨어 개발", ["오류 원인"]],
  ["리액트 상태관리 라이브러리 중에 뭘 써야 호환성이 좋아?", "소프트웨어 개발", ["해결 대안"]],
  ["한글이라는 말의 유래가 뭐야?", "역사·문화", ["유래"]],
  ["두통이 며칠째인데 병원에 가야 해?", "생활 건강", ["증상 정리"]],
  ["벼 재배 시 물 관리는 어떻게 해?", "농업", ["재배 관리"]],
  ["감가상각이란 무엇인지 정의해줘", "경제·회계", ["개념·제도"]],
  ["갑오개혁에서 어떤 제도가 바뀌었어?", "한국사", ["사건·제도"]],
  ["아이가 말을 늦게 하는데 위험 신호일까?", "육아", ["위험 신호"]],
  ["스마트폰 화면 녹화를 단계별로 알려줘", "PC·스마트폰", ["단계별"]],
  ["와이파이가 자꾸 끊기는 원인을 좁혀줘", "PC·스마트폰", ["문제 원인"]],
  ["빵 반죽이 부풀지 않는 원리가 뭐야?", "요리", ["원리와 순서"]],
  ["부당해고를 당했을 때 구제 절차가 어떻게 돼?", "생활·노동", ["권리와 절차"]],
  ["ISA 계좌 이자 세금을 계산하는 근거를 알려줘", "재테크", ["계산 근거"]],
  ["일본 3박 4일 여행 준비물 체크리스트 알려줘", "여행", ["준비 체크리스트"]],
  ["광합성 원리를 쉽게 설명해줘", "과학 원리", ["원리 설명"]],
];
const base = "http://127.0.0.1:18081/api/admin/router";
const router = await (await fetch(base)).json();
const margin = process.env.PROC_MARGIN === undefined ? undefined : Number(process.env.PROC_MARGIN);
const config = margin === undefined ? undefined : { ...router, procedure: { steps: router.procedure.steps.map((step) => ({ ...step, margin })) } };
const rows = [];
for (const [query, target, expect] of set) {
  const r = await (await fetch(`${base}/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, procedures: true, ...(config ? { config } : {}) }) })).json();
  const entry = (r.procedures ?? []).find((p) => p.researcher.includes(target));
  const picked = entry?.selected ?? [];
  const hit1 = expect.some((e) => (picked[0] ?? "").includes(e));
  const hit2 = picked.some((name) => expect.some((e) => name.includes(e)));
  rows.push({ query, picked, hit1, hit2, included: Boolean(entry) });
  console.log(hit1 ? "1위 " : hit2 ? "2위 " : entry ? "미스" : "조사원 미선택", `[${target}]`, picked.join(" , ") || "(없음)", "|", query);
}
const n = rows.length;
const inc = rows.filter((x) => x.included);
console.log(`margin=${margin ?? "라이브"} 질의 ${n}: 대상 조사원 포함 ${inc.length}, 선택 평균 ${(inc.reduce((s, x) => s + x.picked.length, 0) / (inc.length || 1)).toFixed(2)}, 1위 적중 ${rows.filter((x) => x.hit1).length}, 상위2 적중 ${rows.filter((x) => x.hit2).length}`);
