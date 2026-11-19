// 앱의 실제 경로로 분류 모드(classic) 실행 여러 개를 동시에 시작한다(조사원 선택 → 수집 큐 → DB 조회 · 임베딩 → 라이터 → 최종 답변).
// DB 조회형(pgvector) 조사원이 걸리는 법률 · 의학 질의를 쓴다. 실행이 끝나면 수집 큐의 종류별 누적 발행 수와 실행별 호출된 조사원을 남긴다.
// 사용: node test/20261119/classic-concurrent.mjs [runs=3] [maxWaitSec=240]   결과: test/20261119/verify/classic-concurrent_result.json
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.DUALCONTEXT_URL ?? "http://127.0.0.1:18081";
const count = Number(process.argv[2] ?? 3);
const maxWaitMs = Number(process.argv[3] ?? 240) * 1000;
const queries = ["근로계약서 없이 일했을 때 퇴직금 청구 요건과 미지급 시 진정 절차", "당뇨병 환자의 식이요법과 합병증 관리 기준", "임대차 보증금 반환 소송 절차와 임차권등기명령", "급성 심근경색의 초기 증상과 응급 처치", "부당해고 구제신청 기간과 절차"];
const out = new URL("./verify/", import.meta.url);
mkdirSync(out, { recursive: true });
const api = async (path, init) => (await fetch(`${base}/api/admin${path}`, { ...init, signal: AbortSignal.timeout(30_000) })).json();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const before = (await api("/status")).collect;
const started = Date.now();
const runs = await Promise.all(Array.from({ length: count }, async (_, index) => {
  const query = queries[index % queries.length];
  const { runId } = await api("/augment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, mode: "classic" }) });
  return { runId, query };
}));
console.log("runs", runs.map((r) => r.runId).join(","), new Date().toISOString());
const done = new Map();
while (done.size < runs.length && Date.now() - started < maxWaitMs) {
  await sleep(3000);
  for (const run of runs) {
    if (done.has(run.runId)) continue;
    const detail = await api(`/runs/${run.runId}`);
    if (detail.status !== "running") {
      const kinds = {};
      for (const pair of detail.pairs ?? []) kinds[pair.researcher] = (kinds[pair.researcher] ?? 0) + 1;
      done.set(run.runId, { runId: run.runId, query: run.query, status: detail.status, error: detail.error ?? null, elapsedMs: Date.now() - started, researchers: kinds, contextChars: detail.context?.length ?? null });
    }
  }
}
for (const run of runs) if (!done.has(run.runId)) {
  await api(`/runs/${run.runId}/cancel`, { method: "POST" }).catch(() => {});
  done.set(run.runId, { runId: run.runId, query: run.query, status: "timeout-cancelled", elapsedMs: Date.now() - started });
}
const after = (await api("/status")).collect;
const delta = Object.fromEntries(Object.keys(after).map((k) => [k, { dispatched: after[k].dispatched - before[k].dispatched, maxInFlight: after[k].maxInFlight }]));
const summary = { runs: count, elapsedMs: Date.now() - started, collectQueues: delta, detail: [...done.values()] };
writeFileSync(new URL("./classic-concurrent_result.json", out), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
