// F:\dev 프로젝트 코드 조사원 측정: (1) 라우팅 미리보기에서 해당 프로젝트가 선택되는지, (2) 전체 경로 실행 기록에서 그 조사원 자료에
// 기대 단서(심볼·키워드)가 들어 있는지와 걸린 시간. 단서는 호스트 파일시스템을 직접 grep 해 실제로 그 프로젝트에 있는지 먼저 확인한다(라벨 검증).
// 라벨은 이 파일에서 직접 만든 것이다. node test/20261115/workspace-code-eval.mjs   (ROUTE_ONLY=1 이면 라우팅만)
import { execFileSync } from "node:child_process";
const base = "http://127.0.0.1:18081/api/admin";
const set = [
  ["dualcontext", "dualcontext 에서 얕은 클론을 수행하는 cloneShallow 함수는 어디에 있어", "cloneShallow"],
  ["dualcontext", "dualcontext 의 selectResearchers 구현을 보여줘", "selectResearchers"],
  ["ytkit", "ytkit 에서 yt-dlp 를 호출하는 코드가 어디야", "yt-dlp"],
  ["pdfgpu", "pdfgpu 의 pdfium 엔진 구현 코드", "pdfiumEngine"],
  ["apibond", "apibond 의 설정 로딩 config 구현 Rust", "config"],
  ["issus", "issus 의 inbox 프로토콜 구현 코드", "inbox"],
  ["codebase-memory-mcp", "codebase-memory-mcp 가 call graph 를 만드는 코드", "graph"],
  ["relaycast", "relaycast 채널 메시지 전송 API 핸들러", "channel"],
  ["opencodesearch", "opencodesearch 의 검색 결과 JSON 스키마 검증 처리", "schema"],
  ["voice", "voice 서비스에서 TTS 엔진을 고르는 코드", "engine"],
  ["relay", "agent relay 의 broker 구현", "broker"],
  ["p4studio", "P4 Studio 의 노드 관리 API 구현", "node"],
  ["whodistibute", "whodistibute 의 Express API 라우터 구성", "router"],
  ["ggufconverter", "gguf 변환 결과를 허깅페이스에 올리는 코드", "upload"],
  ["vibeagent", "vibeagent 에서 코딩 에이전트 turn loop 를 분석한 부분", "loop"]
];
const exists = (project, cue) => {
  try { execFileSync("grep", ["-rIliq", "--exclude-dir=node_modules", "--exclude-dir=.git", "--exclude-dir=dist", "--exclude-dir=.cache", "--exclude-dir=.venv", "--exclude-dir=target", cue, `F:/dev/${project}`], { stdio: "pipe", timeout: 120000 }); return true; } catch { return false; }
};
const rows = [];
let next = 0;
const worker = async () => {
  while (next < set.length) {
    const [project, query, cue] = set[next++];
    const target = `코드: ${project}`;
    const labelOk = exists(project, cue);
    const route = await (await fetch(`${base}/router/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) })).json();
    const routed = (route.selected ?? []).includes(target);
    const row = { project, query, cue, labelOk, routed, others: (route.selected ?? []).filter((n) => n !== target).join(", ") };
    if (!process.env.ROUTE_ONLY) {
      const t = Date.now();
      const start = await (await fetch(`${base}/augment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) })).json();
      let d;
      for (;;) { await new Promise((s) => setTimeout(s, 4000)); d = await (await fetch(`${base}/runs/${start.runId}`)).json(); if (d.status !== "running") break; }
      const pairs = (d.pairs ?? []).filter((p) => (p.researcher ?? "") === target);
      Object.assign(row, { runId: start.runId, status: d.status, collected: pairs.length > 0, hit: JSON.stringify(pairs).toLowerCase().includes(cue.toLowerCase()), sec: Math.round((Date.now() - t) / 1000) });
    }
    rows.push(row);
  }
};
await Promise.all([worker(), worker(), worker()]);
rows.sort((a, b) => set.findIndex((s) => s[1] === a.query) - set.findIndex((s) => s[1] === b.query));
for (const r of rows) console.log(r.routed ? "선택" : "미선택", r.labelOk ? "" : "[라벨무효]", `[${r.project}]`, r.runId ? `run ${r.runId} ${r.status} ${r.sec}s 수집 ${r.collected ? (r.hit ? "단서있음" : "단서없음") : "없음"}` : "", `기타[${r.others}]`, "|", r.query);
console.log(`질의 ${rows.length}: 라벨 유효 ${rows.filter((r) => r.labelOk).length}, 선택 ${rows.filter((r) => r.routed).length}${process.env.ROUTE_ONLY ? "" : `, 수집 ${rows.filter((r) => r.collected).length}, 단서 있음 ${rows.filter((r) => r.hit).length}`}`);
