// 전체 경로(라우팅→컨텍스트→답변 2개) 실패율 측정: node test/20261115/answer-run.mjs <라벨> <동시성> <개수>
// 평가 세트에서 heldout 양성·real 질의를 고르게 뽑아 POST /augment?wait=1 로 보낸다. 결과: test/20261115/answer-results/<라벨>.json
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const base = process.env.ADMIN_URL ?? "http://127.0.0.1:18081/api/admin";
const [label, concArg, countArg] = process.argv.slice(2);
const conc = Number(concArg), count = Number(countArg);
const all = JSON.parse(readFileSync("test/20261115/route-eval-set.json", "utf8"));
const pool = [...all.filter((i) => i.set === "heldout" && i.topics.length > 0), ...all.filter((i) => i.set === "real")];
const items = Array.from({ length: count }, (_, k) => pool[(k * 7) % pool.length]);
const out = new Array(items.length); let next = 0; const started = Date.now();
async function worker() {
  for (;;) {
    const i = next++; if (i >= items.length) return;
    const t = Date.now();
    try {
      const r = await fetch(`${base}/augment?wait=1`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: items[i].query }) });
      const b = await r.json();
      out[i] = { id: items[i].id, http: r.status, runId: b.runId, error: b.error ?? null, selected: b.routing?.selected ?? null, contextChars: b.context?.length ?? null,
        before: b.answers?.before ? { ms: b.answers.before.ms, error: b.answers.before.error ?? null } : null,
        after: b.answers?.after ? { ms: b.answers.after.ms, error: b.answers.after.error ?? null, skipped: b.answers.after.skipped ?? false } : null, ms: Date.now() - t };
    } catch (e) { out[i] = { id: items[i].id, http: 0, error: String(e), ms: Date.now() - t }; }
    process.stderr.write(".");
  }
}
await Promise.all(Array.from({ length: conc }, worker));
mkdirSync("test/20261115/answer-results", { recursive: true });
writeFileSync(`test/20261115/answer-results/${label}.json`, JSON.stringify({ label, conc, startedAt: new Date(started).toISOString(), elapsedMs: Date.now() - started, out }, null, 1));
const fail = (o) => o.http !== 200 || o.error || o.before?.error || (o.after?.error);
console.log(`${label}: ${out.filter(fail).length}/${out.length} 실패, ${((Date.now() - started) / 1000).toFixed(0)}s`);
