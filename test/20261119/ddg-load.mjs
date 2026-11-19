// 덕덕고(웹 검색) 조사원만 병렬로 발동시키는 부하: 앱의 실제 수집기(collectDuckDuckGo)를 워커 3개가 반복 호출한다(검색어 재작성 모델 호출 · DB 는 거치지 않는다).
// 실행(apps/dualcontext 에서): node --import tsx ../../test/20261119/ddg-load.mjs [seconds=45] [workers=3]   결과: test/20261119/verify/ddg-load_result.json
import { mkdirSync, writeFileSync } from "node:fs";
import { collectDuckDuckGo } from "../../apps/dualcontext/src/server/collect/duckduckgo/index.ts";

const seconds = Number(process.argv[2] ?? 45);
const workers = Number(process.argv[3] ?? 3);
const queries = ["퇴직금 청구 요건", "임대차 보증금 반환 절차", "당뇨병 식이요법", "부당해고 구제신청", "파이썬 가상환경 venv", "고혈압 약물 치료 기준", "Flask 설정 불러오기", "상속 포기 기한"];
const out = new URL("./verify/", import.meta.url);
mkdirSync(out, { recursive: true });
const stopAt = Date.now() + seconds * 1000;
const rows = [];
await Promise.all(Array.from({ length: workers }, async (_, index) => {
  let round = index;
  while (Date.now() < stopAt) {
    const query = queries[round++ % queries.length];
    const t0 = performance.now();
    try {
      const found = await collectDuckDuckGo({ topK: 5 }, query);
      rows.push({ worker: index, ms: Math.round(performance.now() - t0), results: found.length, error: null });
    } catch (error) {
      rows.push({ worker: index, ms: Math.round(performance.now() - t0), results: 0, error: String(error instanceof Error ? error.message : error).slice(0, 80) });
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}));
const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
const pick = (p) => ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] ?? null;
const errors = {};
for (const r of rows) if (r.error) errors[r.error] = (errors[r.error] ?? 0) + 1;
const summary = { seconds, workers, requests: rows.length, withResults: rows.filter((r) => r.results > 0).length, errors, ms: { p50: pick(0.5), p99: pick(0.99), max: ms[ms.length - 1] ?? null } };
writeFileSync(new URL("./ddg-load_result.json", out), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
