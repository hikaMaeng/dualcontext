// 컨텍스트 계획기 실서버 시험: 모드를 지정해 실행하고 계획 요약(아이템·의존성·웨이브·라운드)을 출력한다.
// node test/20261117/plan-live-eval.mjs <decompose|reevaluate> "<질의>" [plan override JSON]
const base = "http://127.0.0.1:18081/api/admin";
const [mode, query, override] = process.argv.slice(2);
const start = await (await fetch(`${base}/augment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, mode, ...(override ? { plan: JSON.parse(override) } : {}) }) })).json();
const t = Date.now();
let d;
for (;;) { await new Promise((s) => setTimeout(s, 5000)); d = await (await fetch(`${base}/runs/${start.runId}`)).json(); if (d.status !== "running") break; }
const p = d.plan;
console.log(`run ${start.runId} status=${d.status} ${Math.round((Date.now() - t) / 1000)}s error=${d.error ?? "-"}`);
if (!p) process.exit(0);
console.log(`mode=${p.mode} stop=${p.stop} planMs=${p.ms} items=${p.items.length} levels=${JSON.stringify(p.levels)} waves=${JSON.stringify(p.waves)}`);
const name = (id) => p.items.find((i) => i.id === id)?.name ?? id;
for (const i of p.items) console.log(` ${i.id} L${i.level} ${i.top ? "TOP" : "pre"} r${i.round} ${i.status} ctx=${i.context.length} needs=[${i.needs.map(name).join(" | ")}] ${i.name}`);
for (const r of p.rounds) console.log(` round ${r.round} score=${r.evaluation?.score} pass=${r.evaluation?.pass} missing=[${(r.evaluation?.missing ?? []).map((m) => m.name).join(" | ")}] added=[${r.addedItemIds.map(name).join(",")}] reason=${r.evaluation?.reason ?? r.evaluationError}`);
console.log(`final context chars=${d.context.length} after.fromPlan=${d.answers?.after?.fromPlan}`);
