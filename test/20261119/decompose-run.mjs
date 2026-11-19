// 질의분해(decompose)를 저장된 계획 한도 그대로(한도 override 없이) 한 번 실행하고, 10초마다 실행 상태를 남긴다.
// 호스트 관측은 host-monitor.ps1 가 따로 한다. 이 스크립트는 한도를 줄이지 않는다(사용자가 겪은 조건 재현이 목적).
// 사용: node test/20261119/decompose-run.mjs [maxWaitMin=40]   결과: test/20261119/verify/decompose-run_result.json
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.DUALCONTEXT_URL ?? "http://127.0.0.1:18081";
const maxWaitMs = Number(process.argv[2] ?? 40) * 60_000;
const query = "근로계약서 없이 일했을 때 퇴직금 청구 요건과 미지급 시 진정 절차를 알려줘";
const out = new URL("./verify/", import.meta.url);
mkdirSync(out, { recursive: true });
const api = async (path, init) => {
  const response = await fetch(`${base}/api/admin${path}`, { ...init, signal: AbortSignal.timeout(30_000) });
  return response.json();
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const started = Date.now();
const { runId } = await api("/augment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, mode: "decompose" }) });
console.log("runId", runId, new Date().toISOString());
const samples = [];
let detail = null;
for (;;) {
  try {
    detail = await api(`/runs/${runId}`);
    samples.push({ t: Math.round((Date.now() - started) / 1000), status: detail.status, stage: detail.stage, progress: detail.planProgress?.stage, detail: detail.planProgress?.detail, items: detail.plan?.items?.length ?? null, steps: detail.plan?.steps?.length ?? null, nodes: detail.nodes?.length ?? null });
    if (detail.status !== "running") break;
  } catch (error) {
    samples.push({ t: Math.round((Date.now() - started) / 1000), error: String(error) });
  }
  if (Date.now() - started > maxWaitMs) {
    console.log("최대 대기 초과: 취소 요청");
    await api(`/runs/${runId}/cancel`, { method: "POST" }).catch(() => {});
    await sleep(5000);
    detail = await api(`/runs/${runId}`).catch(() => detail);
    break;
  }
  await sleep(10_000);
}
const final = {
  runId, mode: "decompose", elapsedMs: Date.now() - started, status: detail?.status, error: detail?.error ?? null,
  planStop: detail?.plan?.stop, items: detail?.plan?.items?.length, levels: detail?.plan?.levels?.length, waves: detail?.plan?.waves?.length, steps: detail?.plan?.steps?.length,
  settingsPlan: detail?.settings?.plan ? { mode: detail.settings.plan.mode, maxLevels: detail.settings.plan.maxLevels, maxNeedsPerItem: detail.settings.plan.maxNeedsPerItem, maxItems: detail.settings.plan.maxItems } : null,
  answers: { before: detail?.answers?.before?.text?.length ?? null, after: detail?.answers?.after?.text?.length ?? null },
  samples
};
writeFileSync(new URL("./decompose-run_result.json", out), JSON.stringify(final, null, 2));
const { samples: _s, ...brief } = final;
console.log(JSON.stringify(brief, null, 1));
