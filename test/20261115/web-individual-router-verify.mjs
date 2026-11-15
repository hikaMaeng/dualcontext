const qs = [
 ["오늘 서울 날씨 어때?", true], ["최근 비트코인 가격 알려줘", true], ["애플의 최신 아이폰 출시일", true], ["이번 주 환율 전망", true], ["올해 월드컵 우승국이 어디야", true], ["지금 삼성전자 주가 얼마야", true], ["내일 부산 일정에 비 오나", true], ["이번 주 코스피 마감 어땠어", true],
 ["파이썬 리스트 정렬 방법", false], ["아이가 밥을 안 먹어요 어떻게 하죠", false], ["근로기준법 휴업수당 기준", false], ["RTX 4060과 RX 7600의 TDP 비교", false], ["빵 반죽 글루텐이 생기는 과정", false], ["허리 디스크 초기 증상이 뭐고 병원은 몇 과로 가야 하죠?", false],
];
let right = 0;
for (const [query, want] of qs) {
  const t = Date.now();
  const r = await (await fetch("http://127.0.0.1:18081/api/admin/router/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, procedures: false }) })).json();
  const v = r.asked[0].individual.find((x) => /덕덕고/.test(x.researcher));
  const ok = v.selected === want; if (ok) right++;
  console.log(ok ? "OK " : "XX ", want ? "필요  " : "불필요", v.selected ? "포함" : "제외", v.mode.padEnd(22), Math.round((Date.now() - t) / 100) / 10 + "s", "|", query, "→ 선택:", r.selected.join("/").slice(0, 40));
}
console.log(`일치 ${right}/${qs.length}`);
