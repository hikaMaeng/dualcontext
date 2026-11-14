// 라우팅 평가 실행: 평가 세트의 모든 질의를 한 설정으로 POST /router/preview 에 보내 결과를 파일로 남긴다.
//   node test/20261115/route-eval-run.mjs <설정이름> <회차> [동시성=1]
//   결과: test/20261115/route-eval-results/<설정이름>_r<회차>.json  (설정 전체, 질의별 선택·단계 기록·지연 포함)
// 서버는 저장된 설정을 바꾸지 않는다(요청마다 설정을 실어 보낸다).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildConfigs } from "./route-eval-configs.mjs";

const base = process.env.ADMIN_URL ?? "http://127.0.0.1:18081/api/admin";
const [name, run, concurrencyArg] = process.argv.slice(2);
const concurrency = Number(concurrencyArg ?? 1);
const defaults = await (await fetch(`${base}/router/defaults`)).json();
const entry = buildConfigs(defaults).find((candidate) => candidate.name === name);
if (!entry) throw new Error(`unknown config ${name}`);
const items = JSON.parse(readFileSync("test/20261115/route-eval-set.json", "utf8"));
mkdirSync("test/20261115/route-eval-results", { recursive: true });
const out = `test/20261115/route-eval-results/${name}_r${run}.json`;

const results = new Array(items.length);
let next = 0;
const started = Date.now();
async function worker() {
  for (;;) {
    const index = next++;
    if (index >= items.length) return;
    const item = items[index];
    const t = Date.now();
    try {
      const response = await fetch(`${base}/router/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: item.query, config: entry.config, procedures: false }) });
      const body = await response.json();
      results[index] = response.ok
        ? { id: item.id, selected: body.selected, parts: body.parts, mode: body.mode, asked: body.asked.map((a) => ({ asked: a.asked, selected: a.selected, mode: a.mode, steps: a.steps })), scores: body.scores, ms: Date.now() - t }
        : { id: item.id, error: `${response.status} ${JSON.stringify(body).slice(0, 200)}`, ms: Date.now() - t };
    } catch (error) {
      results[index] = { id: item.id, error: String(error), ms: Date.now() - t };
    }
    process.stderr.write(".");
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
process.stderr.write("\n");
writeFileSync(out, JSON.stringify({ name, run: Number(run), concurrency, startedAt: new Date(started).toISOString(), elapsedMs: Date.now() - started, config: entry.config, results }, null, 1));
console.log(`${name} r${run}: ${results.filter((r) => r.error).length} errors, ${((Date.now() - started) / 1000).toFixed(0)}s -> ${out}`);
