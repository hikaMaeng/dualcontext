// 질의마다 증강 파이프라인(라우팅 → 수집 → 라이터)을 끝까지 돌려 컨텍스트가 비는지, 어떤 조사원이 자료를 냈는지 본다.
// 답변 생성은 기다리지 않는다(컨텍스트가 기록되는 'answering' 단계에서 읽는다).
//   node test/20261115/e2e-context.mjs > test/20261115/e2e-context_result.json
// 질의는 routing-calibration27_result.json 의 무관·복합 질의와 실행 로그 8건(이전 재실행 결과 파일)을 쓴다.
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:18081/api/admin";
const calibration = JSON.parse(readFileSync("test/20261115/routing-calibration27_result.json", "utf8"));
const rerun = JSON.parse(readFileSync("test/20261115/rerun-cases_result.json", "utf8"));
const queries = [
  ...calibration.negativeTop.map((entry, index) => ({ id: `N${index + 1}`, kind: "negative", query: entry.query })),
  ...rerun.map((entry) => ({ id: `#${entry.previousId}`, kind: "logged", query: entry.query }))
];
const concurrency = 4;

async function runOne(item) {
  const created = await (await fetch(`${BASE}/augment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: item.query }) })).json();
  const started = Date.now();
  for (;;) {
    const run = await (await fetch(`${BASE}/runs/${created.runId}`)).json();
    if (run.stage === "answering" || run.status !== "running") {
      const selected = (run.routing?.researchers ?? []).filter((entry) => entry.selected).map((entry) => `${entry.name}:${entry.score}`);
      process.stderr.write(`${item.id} -> #${created.runId}\n`);
      return { ...item, runId: created.runId, selected, pairs: (run.pairs ?? []).map((pair) => `${pair.researcher}/${pair.procedure ?? "-"}/${pair.materialCount}`), contextChars: (run.context ?? "").length, context: run.context };
    }
    if (Date.now() - started > 10 * 60 * 1000) return { ...item, runId: created.runId, error: "timeout-in-script" };
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

const queue = [...queries];
const results = [];
await Promise.all(Array.from({ length: concurrency }, async () => { while (queue.length > 0) results.push(await runOne(queue.shift())); }));
results.sort((a, b) => queries.findIndex((q) => q.id === a.id) - queries.findIndex((q) => q.id === b.id));
console.log(JSON.stringify(results, null, 1));
