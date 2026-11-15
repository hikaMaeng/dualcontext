// 신규 조사원 2종(crawler, codebase)을 실서버에 등록한다(이미 있으면 건너뜀). node test/20261115/new-researchers-setup.mjs
const base = "http://127.0.0.1:18081/api/admin";
const list = await (await fetch(`${base}/researchers`)).json();
const defs = [
  { name: "파이썬 공식 문서(크롤)", description: "docs.python.org 의 파이썬 튜토리얼·표준 라이브러리 문서를 크롤해 검색한다. 파이썬 문법, 가상환경, 모듈, 표준 라이브러리 사용법을 묻는 질의를 맡는다.", keywords: ["파이썬", "python", "venv", "모듈", "표준 라이브러리"], enabled: true, type: "crawler",
    config: { startUrls: ["https://docs.python.org/3/tutorial/venv.html", "https://docs.python.org/3/tutorial/errors.html", "https://docs.python.org/3/tutorial/datastructures.html"], allowedDomains: ["docs.python.org"], depth: 0, maxPages: 3, includePatterns: ["^/3/tutorial/"], delayMs: 1000, refreshHours: 24, topK: 3 } },
  { name: "Flask 소스 코드", description: "Flask 웹 프레임워크(pallets/flask) 소스 코드. 라우팅, 요청·응답, 블루프린트, 컨텍스트 구현이 코드에서 어떻게 되어 있는지 묻는 질의를 맡는다.", keywords: ["flask", "route", "blueprint", "request", "소스 코드"], enabled: true, type: "codebase",
    config: { source: "git", url: "https://github.com/pallets/flask", subPath: "src/flask", refreshHours: 24, topK: 5 } }
];
for (const def of defs) {
  if (list.some((r) => r.name === def.name)) { console.log("있음", def.name); continue; }
  const r = await fetch(`${base}/researchers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...def, procedureIds: [] }) });
  console.log(r.status, def.name, r.ok ? "" : await r.text());
}
