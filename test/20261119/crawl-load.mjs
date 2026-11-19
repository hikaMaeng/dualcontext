// 크롤러 조사원(29, 파이썬 공식 문서 3페이지)만 반복 발동시키는 부하: 앱의 실제 경로(POST /api/admin/researchers/29/crawl → 크롤러 컨테이너 렌더링 → 청크 · 임베딩)를
// 끝날 때까지 기다렸다가 다시 시작하기를 주어진 시간 동안 되풀이한다(캐시를 지우지 않는다).
// 사용: node test/20261119/crawl-load.mjs [seconds=60] [researcherId=29]   결과: test/20261119/verify/crawl-load_result.json
import { mkdirSync, writeFileSync } from "node:fs";

const seconds = Number(process.argv[2] ?? 60);
const id = Number(process.argv[3] ?? 29);
const base = process.env.DUALCONTEXT_URL ?? "http://127.0.0.1:18081";
const out = new URL("./verify/", import.meta.url);
mkdirSync(out, { recursive: true });
const api = async (path, init) => {
  const response = await fetch(`${base}/api/admin${path}`, { ...init, signal: AbortSignal.timeout(30_000) });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stopAt = Date.now() + seconds * 1000;
const rounds = [];
while (Date.now() < stopAt) {
  const t0 = Date.now();
  const started = await api(`/researchers/${id}/crawl`, { method: "POST" });
  let state = null;
  while (Date.now() - t0 < 120_000) {
    await sleep(1000);
    state = (await api(`/researchers/${id}/crawl`)).body;
    if (state && state.status !== "running") break;
  }
  rounds.push({ startStatus: started.status, ms: Date.now() - t0, status: state?.status ?? null, pages: state?.pages ?? null, chunks: state?.chunks ?? null, error: state?.error ?? null });
}
const summary = { seconds, researcherId: id, rounds: rounds.length, detail: rounds };
writeFileSync(new URL("./crawl-load_result.json", out), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
