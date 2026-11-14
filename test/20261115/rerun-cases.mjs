// 건별 분석(#6~#36)에서 문제가 확인된 질의를 수정 뒤 같은 조건으로 다시 돌려 이전 로그와 대조한다.
//   node test/20261115/rerun-cases.mjs <이전 runs 디렉터리> > test/20261115/rerun-cases_result.json
// POST /augment(비동기) → GET /runs/:id 폴링. 이전 실행 번호의 질의를 그대로 쓴다.
import { readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:18081/api/admin";
const dir = process.argv[2];
const cases = (process.env.CASES ?? "36,16,27,25,8,31,28,30").split(",").map(Number);
const concurrency = 3;

async function runOne(previousId) {
  const prev = JSON.parse(readFileSync(path.join(dir, `run${previousId}.json`), "utf8"));
  const started = Date.now();
  const created = await (await fetch(`${BASE}/augment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: prev.query }) })).json();
  let run;
  for (;;) {
    run = await (await fetch(`${BASE}/runs/${created.runId}`)).json();
    if (run.status !== "running") break;
    if (Date.now() - started > 20 * 60 * 1000) { run.status = "timeout-in-script"; break; }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  process.stderr.write(`#${previousId} -> #${created.runId} ${run.status}\n`);
  return { previousId, runId: created.runId, query: prev.query, previous: summarize(prev), current: summarize(run), currentAnswers: run.answers, context: run.context };
}

function summarize(run) {
  const selected = (run.routing?.researchers ?? []).filter((r) => r.selected).map((r) => `${r.name}:${r.score}`);
  return {
    selected: selected.length > 0 ? selected : (run.pairs ?? []).map((p) => p.researcher).filter((v, i, a) => a.indexOf(v) === i),
    pairs: (run.pairs ?? []).map((p) => `${p.researcher}/${p.procedure ?? "-"}/${p.materialCount}`),
    contextChars: (run.context ?? "").length,
    before: run.answers?.before ? { chars: (run.answers.before.text ?? "").length, error: run.answers.before.error, skipped: run.answers.before.skipped === true, ms: run.answers.before.ms } : null,
    after: run.answers?.after ? { chars: (run.answers.after.text ?? "").length, error: run.answers.after.error, skipped: run.answers.after.skipped === true, ms: run.answers.after.ms } : null
  };
}

const queue = [...cases];
const results = [];
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (queue.length > 0) results.push(await runOne(queue.shift()));
}));
results.sort((a, b) => cases.indexOf(a.previousId) - cases.indexOf(b.previousId));
console.log(JSON.stringify(results, null, 1));
