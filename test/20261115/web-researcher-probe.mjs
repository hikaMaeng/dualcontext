// 웹 조사원의 임베딩 텍스트 변형별 질의 유사도 비교(저장된 조사원은 바꾸지 않는다): node test/20261115/web-researcher-probe.mjs
const emb = "http://127.0.0.1:12345/v1/embeddings";
const model = "embeddinggemma2:mp";
const embed = async (input) => (await (await fetch(emb, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, input }) })).json()).data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };
const r = (await (await fetch("http://127.0.0.1:18081/api/admin/researchers")).json()).find((x) => x.id === 7);
const positive = r.description.split(". ")[0] + ".";
const variants = {
  "현재(이름+설명전체+키워드)": `${r.name}\n${r.description}\n${r.keywords.join(", ")}`,
  "부정 문장 제거(긍정 설명만)": `${r.name}\n${positive}\n${r.keywords.join(", ")}`,
  "이름+키워드만": `${r.name}\n${r.keywords.join(", ")}`,
  "범용 설명": `${r.name}\n웹에서 최신 정보와 실시간 사실을 검색한다. 뉴스, 날씨, 가격, 환율, 일정, 신제품 출시와 발표, 현재 상황.\n${r.keywords.join(", ")}`
};
const groups = {
  "최신성 필요": ["오늘 서울 날씨 어때?", "최근 비트코인 가격 알려줘", "애플의 최신 아이폰 출시일", "이번 주 환율 전망", "올해 월드컵 우승국이 어디야", "지금 삼성전자 주가 얼마야"],
  "최신성 불필요": ["파이썬 리스트 정렬 방법", "아이가 밥을 안 먹어요 어떻게 하죠", "근로기준법 휴업수당 기준", "RTX 4060과 RX 7600의 TDP 비교", "빵 반죽 글루텐이 생기는 과정", "허리 디스크 초기 증상이 뭐고 병원은 몇 과로 가야 하죠?"]
};
const queries = Object.values(groups).flat();
const qv = await embed(queries);
const names = Object.keys(variants);
const vv = await embed(names.map((n) => variants[n]));
console.log("변형".padEnd(28), "최신성필요 평균", "최신성불필요 평균", "격차", "필요 최소", "불필요 최대");
names.forEach((n, vi) => {
  const s = queries.map((_, qi) => cos(qv[qi], vv[vi]));
  const need = s.slice(0, 6), no = s.slice(6);
  const avg = (a) => a.reduce((p, c) => p + c, 0) / a.length;
  console.log(n.padEnd(28), avg(need).toFixed(3).padStart(8), avg(no).toFixed(3).padStart(14), (avg(need) - avg(no)).toFixed(3).padStart(8), Math.min(...need).toFixed(3).padStart(8), Math.max(...no).toFixed(3).padStart(10));
  if (vi === 0) queries.forEach((q, qi) => console.log("   ", s[qi].toFixed(3), q));
});
