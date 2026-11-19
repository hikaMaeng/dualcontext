// effort 하나를 실제 MCP(중계)로 호출하고, 호출하는 동안 5초마다 상태 API 표본(큐 inFlight · 대기 · 이벤트 루프)을 남긴다.
// 사용: node test/20261119/mcp-effort.mjs <middle|high|xhigh>   결과: test/20261119/verify/mcp-effort_<effort>_result.json
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, writeFileSync } from "node:fs";

const effort = process.argv[2] ?? "middle";
const query = "근로계약서 없이 일했을 때 퇴직금 청구 요건과 미지급 시 진정 절차를 알려줘";
const base = process.env.DUALCONTEXT_URL ?? "http://127.0.0.1:18081";
const out = new URL("./verify/", import.meta.url);
mkdirSync(out, { recursive: true });
const api = async (path) => (await fetch(`${base}/api/admin${path}`)).json();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const listRuns = async () => (await api("/runs?pageSize=100")).items;
const idsBefore = new Set((await listRuns()).map((item) => item.id));
await api("/status");
const transport = new StdioClientTransport({ command: "docker", args: ["exec", "-i", "dualcontext", "node", "/app/dist/server/index.js", "--stdio"] });
const client = new Client({ name: "mcp-effort", version: "0.0.0" });
await client.connect(transport);
const samples = [];
let sampling = true;
const sampler = (async () => {
  const started = Date.now();
  while (sampling) {
    try {
      const status = await api("/status");
      samples.push({ t: Math.round((Date.now() - started) / 1000), inFlight: status.queues.chat.inFlight, queued: status.queues.chat.queued, delayed: status.queues.chat.delayed, maxInFlight: status.queues.chat.maxInFlight, retried: status.queues.chat.retried, eventLoopP99: status.eventLoop.p99, eventLoopMax: status.eventLoop.max });
    } catch { /* 표본 하나 건너뜀 */ }
    await sleep(5000);
  }
})();
const progress = [];
const started = Date.now();
const response = await client.callTool({ name: "augment_context", arguments: { query, effort } }, undefined, { onprogress: (p) => progress.push(p.progress), resetTimeoutOnProgress: true, timeout: 14_400_000 });
const elapsedMs = Date.now() - started;
sampling = false;
await sampler;
await client.close();
const created = (await listRuns()).filter((item) => !idsBefore.has(item.id));
const detail = created.length === 1 ? await api(`/runs/${created[0].id}`) : null;
const text = (response.content ?? []).map((part) => part.text ?? "").join("");
const result = {
  effort, query, isError: response.isError ?? false, elapsedMs, responseChars: text.length, header: text.split("\n---\n")[0], progressCount: progress.length,
  run: detail && {
    id: detail.id, source: detail.source, effort: detail.effort, status: detail.status, error: detail.error, durationMs: detail.durationMs,
    planMode: detail.settings?.plan?.mode, maxRounds: detail.settings?.plan?.reevaluate?.maxRounds, planStop: detail.plan?.stop ?? null,
    items: detail.plan?.items?.length ?? null, rounds: detail.plan?.rounds?.length ?? null, steps: detail.plan?.steps?.length ?? null,
    score: detail.plan?.rounds?.at(-1)?.evaluation?.score ?? null, answersKeys: Object.keys(detail.answers ?? {}), contextChars: (detail.context ?? "").length
  },
  maxInFlight: Math.max(0, ...samples.map((s) => s.maxInFlight)), peakInFlight: Math.max(0, ...samples.map((s) => s.inFlight)), peakQueued: Math.max(0, ...samples.map((s) => s.queued)),
  eventLoopP99Max: Math.max(0, ...samples.map((s) => s.eventLoopP99)), eventLoopMax: Math.max(0, ...samples.map((s) => s.eventLoopMax)),
  samples
};
writeFileSync(new URL(`./mcp-effort_${effort}_result.json`, out), JSON.stringify(result, null, 2));
const { samples: _samples, ...brief } = result;
console.log(JSON.stringify(brief, null, 1));
