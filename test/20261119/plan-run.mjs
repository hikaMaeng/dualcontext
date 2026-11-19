// 계획 모드(reevaluate)를 한도를 줄여 끝까지 돌리고, 그동안 추론 큐의 병렬성(inFlight · 대기)과 이벤트 루프 지연을 5초마다 표본으로 남긴다.
// 사용: node test/20261119/plan-run.mjs [mode=reevaluate] [maxItems=3]
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.DUALCONTEXT_URL ?? "http://127.0.0.1:18081";
const mode = process.argv[2] ?? "reevaluate";
const maxItems = Number(process.argv[3] ?? 3);
const query = "근로계약서 없이 일했을 때 퇴직금 청구 요건과 미지급 시 진정 절차를 알려줘";
const out = new URL("./verify/", import.meta.url);
mkdirSync(out, { recursive: true });
const api = async (path, init) => (await fetch(`${base}/api/admin${path}`, init)).json();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await api("/status"); // eventLoop 히스토그램을 비운다
const started = Date.now();
const body = { query, mode, plan: { maxItems, maxLevels: 2, maxNeedsPerItem: 2, reevaluate: { maxRounds: 1, maxNewItems: 2 } } };
const { runId } = await api("/augment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
console.log("runId", runId);
const samples = [];
for (;;) {
  const status = await api("/status");
  const detail = await api(`/runs/${runId}`);
  samples.push({ t: Math.round((Date.now() - started) / 1000), stage: detail.stage, progress: detail.planProgress?.stage, chat: status.queues.chat, eventLoop: status.eventLoop });
  if (detail.status !== "running") {
    const final = {
      runId, mode, maxItems, elapsedMs: Date.now() - started, status: detail.status, error: detail.error,
      planStop: detail.plan?.stop, items: detail.plan?.items?.length, rounds: detail.plan?.rounds?.length, steps: detail.plan?.steps?.length,
      answers: { before: detail.answers?.before?.text?.length ?? null, after: detail.answers?.after?.text?.length ?? null },
      calls: Object.keys(detail.nodes ?? {}).length,
      maxInFlight: Math.max(...samples.map((s) => s.chat.maxInFlight)), peakQueued: Math.max(...samples.map((s) => s.chat.queued)),
      eventLoopP99Max: Math.max(...samples.map((s) => s.eventLoop.p99)), eventLoopMax: Math.max(...samples.map((s) => s.eventLoop.max)),
      finalQueues: status.queues, samples
    };
    writeFileSync(new URL(`./plan-run_${mode}.json`, out), JSON.stringify(final, null, 2));
    const { samples: _s, ...brief } = final;
    console.log(JSON.stringify(brief, null, 1));
    break;
  }
  await sleep(5000);
}
