// workspace-code-eval.mjs 가 소켓 오류로 중간에 죽어서, 이미 끝난 실행 기록(213~227)에서 같은 표를 다시 만든다. 단서는 그 스크립트의 라벨과 같다.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./workspace-code-eval.mjs", import.meta.url), "utf8");
const set = [...src.matchAll(/^  \["([^"]+)", "([^"]+)", "([^"]+)"\]/gm)].map((m) => ({ project: m[1], query: m[2], cue: m[3] }));
const base = "http://127.0.0.1:18081/api/admin";
const runs = (await (await fetch(`${base}/runs?pageSize=100`)).json()).items;
let collected = 0, hit = 0, done = 0;
for (const item of set) {
  const run = runs.filter((r) => r.query === item.query).sort((a, b) => b.id - a.id)[0];
  if (!run) { console.log("실행 없음", item.project); continue; }
  const d = await (await fetch(`${base}/runs/${run.id}`)).json();
  const pairs = (d.pairs ?? []).filter((p) => p.researcher === `코드: ${item.project}`);
  const ok = JSON.stringify(pairs).toLowerCase().includes(item.cue.toLowerCase());
  done++; if (pairs.length) collected++; if (ok) hit++;
  console.log(pairs.length ? (ok ? "단서있음" : "단서없음") : "수집없음", `[${item.project}] run ${run.id} ${d.status} ${(d.durationMs / 1000).toFixed(0)}s 조각 ${pairs.length}`, "|", item.query);
}
console.log(`질의 ${set.length}: 실행 기록 ${done}, 수집 ${collected}, 단서 있음 ${hit}`);
