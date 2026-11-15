// 신규 조사원(크롤: 파이썬 공식 문서, 코드: Flask 소스)이 알맞은 질의에서만 선택되는지 라우팅 미리보기로 측정한다(라이브 설정).
// 라벨은 직접 만든 것이다. node test/20261115/new-researchers-routing-eval.mjs
const CRAWL = "파이썬 공식 문서", CODE = "Flask 소스";
const set = [
  ["파이썬 가상환경 venv 만드는 방법 알려줘", CRAWL], ["python try except finally 동작 순서가 어떻게 돼?", CRAWL], ["파이썬 리스트 컴프리헨션이랑 딕셔너리 메서드 사용법", CRAWL],
  ["파이썬 튜토리얼에서 예외 처리 어떻게 설명해?", CRAWL], ["파이썬 list.sort 와 sorted 차이", CRAWL], ["pip 로 패키지 설치하고 requirements 만드는 법", CRAWL],
  ["Flask 에서 route 데코레이터가 내부적으로 어떻게 등록돼?", CODE], ["flask blueprint register 구현을 코드에서 보여줘", CODE], ["Flask request context 는 어디서 push 되나 소스 코드 기준으로 설명해", CODE],
  ["Flask abort 함수 구현 코드 어디 있어?", CODE], ["flask 의 url_for 가 URL 을 만드는 과정을 소스에서 추적해줘", CODE], ["Flask app.run 과 dispatch_request 코드 흐름", CODE],
  ["법인 합병이 뭔지 정의해줘", null], ["RTX 4080 전원 파워 몇 와트 필요해?", null], ["내일 서울 날씨 어때?", null], ["두통이 며칠째 계속돼요", null],
  ["대법원 판례에서 소멸시효를 어떻게 봤어?", null], ["빵 반죽이 안 부풀어", null], ["일론 머스크가 운영하는 회사", null], ["일본 3박4일 여행 준비물", null],
  ["CVE 취약점 심각도 확인 방법", null], ["친구와 다퉜는데 사과해야 할까", null], ["엑셀 VLOOKUP 쓰는 법", null], ["자바스크립트 Promise.all 에러 처리", null],
];
let ok = 0, falsePos = 0, miss = 0;
for (const [query, expect] of set) {
  const r = await (await fetch("http://127.0.0.1:18081/api/admin/router/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) })).json();
  const names = (r.researchers ?? r.asked?.[0]?.selected ?? []).map((x) => x.name ?? x);
  const selected = (r.asked?.[0]?.selected ?? r.selected ?? []).map((x) => x.name ?? x);
  const pickCrawl = selected.some((n) => n.includes(CRAWL)), pickCode = selected.some((n) => n.includes(CODE));
  const good = expect === CRAWL ? pickCrawl : expect === CODE ? pickCode : !pickCrawl && !pickCode;
  if (good) ok++; else if (expect === null) falsePos++; else miss++;
  console.log(good ? "OK  " : "NG  ", expect ? `기대[${expect}]` : "기대[없음]", `선택[${selected.join(", ")}]`, "|", query);
}
console.log(`질의 ${set.length}: 적중 ${ok}, 놓침 ${miss}, 오선택 ${falsePos}`);
