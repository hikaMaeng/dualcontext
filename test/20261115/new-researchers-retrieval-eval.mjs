// 신규 조사원의 수집 품질·지연 측정: 질의마다 collect 결과(상위 조각)에 기대 단서 문자열이 들어 있는지와 걸린 시간.
// /augment 전체 경로가 아니라 실서버의 실행 기록(pairs)에서 해당 조사원 자료만 읽는다. node test/20261115/new-researchers-retrieval-eval.mjs
const base = "http://127.0.0.1:18081/api/admin";
const set = [
  ["파이썬 가상환경 venv 만드는 방법 알려줘", "파이썬 공식", ["venv", "activate"]],
  ["python try except finally 동작 순서", "파이썬 공식", ["finally", "except"]],
  ["파이썬 리스트 메서드 append extend 차이", "파이썬 공식", ["append", "extend"]],
  ["python 예외를 raise 로 직접 발생시키는 방법", "파이썬 공식", ["raise"]],
  ["Flask route 데코레이터가 URL 규칙을 어떻게 등록해?", "Flask 소스", ["add_url_rule", "route"]],
  ["Flask blueprint 가 앱에 등록되는 과정 소스 코드", "Flask 소스", ["register", "Blueprint"]],
  ["Flask abort 구현", "Flask 소스", ["abort"]],
  ["flask url_for 구현은 어디에 있어?", "Flask 소스", ["url_for"]],
  ["파이썬 딕셔너리 items keys values 메서드 사용법", "파이썬 공식", ["items", "keys"]],
  ["python 가상환경 활성화 activate 명령", "파이썬 공식", ["activate"]],
  ["Flask redirect 함수 구현 코드", "Flask 소스", ["redirect"]],
  ["Flask render_template 가 템플릿을 찾는 코드", "Flask 소스", ["render_template", "template"]],
];
const rows = [];
for (const [query, target, cues] of set) {
  const t = Date.now();
  const start = await (await fetch(`${base}/augment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) })).json();
  let d;
  for (;;) { await new Promise((s) => setTimeout(s, 4000)); d = await (await fetch(`${base}/runs/${start.runId}`)).json(); if (d.status !== "running") break; }
  const pairs = (d.pairs ?? []).filter((p) => (p.researcher ?? "").includes(target));
  const text = JSON.stringify(pairs);
  const hit = cues.some((c) => text.toLowerCase().includes(c.toLowerCase()));
  rows.push({ query, target, selected: pairs.length > 0, hit, ms: d.durationMs, status: d.status });
  console.log(pairs.length ? (hit ? "단서 있음" : "단서 없음") : "조사원 미선택", `[${target}]`, `run ${start.runId}`, `${((Date.now() - t) / 1000).toFixed(0)}s`, d.status, "|", query);
  if (process.env.SHOW) console.log(text.slice(0, 700));
}
console.log(`질의 ${rows.length}: 선택 ${rows.filter((r) => r.selected).length}, 단서 있음 ${rows.filter((r) => r.hit).length}`);
