// 배포된 컨테이너의 MCP stdio 중계를 실제로 검증한다: 정상 호출 · 진행 알림 · 클라이언트 취소 · 프로세스 종료 취소 · 큐 계측.
// 사용: node test/20261119/mcp-verify.mjs   (컨테이너 dualcontext 와 AI 서버가 떠 있어야 한다)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.DUALCONTEXT_URL ?? "http://127.0.0.1:18081";
const query = "근로계약서 없이 일했을 때 퇴직금 청구 요건과 미지급 시 진정 절차를 알려줘";
const out = new URL("./verify/", import.meta.url);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const api = async (path, init) => (await fetch(`${base}/api/admin${path}`, init)).json();
const runs = async () => (await api("/runs?pageSize=20")).items;
const result = { startedAt: new Date().toISOString(), checks: [] };
const check = (name, ok, detail) => { result.checks.push({ name, ok, detail }); console.log(`${ok ? "OK  " : "FAIL"} ${name}`, detail ?? ""); };

const connect = async () => {
  const transport = new StdioClientTransport({ command: "docker", args: ["exec", "-i", "dualcontext", "node", "/app/dist/server/index.js", "--stdio"] });
  const client = new Client({ name: "mcp-verify", version: "0.0.0" });
  await client.connect(transport);
  return { client, transport };
};
const waitRun = async (id, ms) => {
  const until = Date.now() + ms;
  for (;;) {
    const detail = await api(`/runs/${id}`);
    if (detail.status !== "running" || Date.now() > until) return detail;
    await sleep(500);
  }
};
const newRun = async (before) => (await runs()).find((item) => !before.has(item.id));

// 0. 상태 API 계측
const status0 = await api("/status");
check("status: queues · activeRuns · eventLoop 가 있다", Boolean(status0.queues?.chat && status0.queues?.embed && typeof status0.activeRuns === "number" && status0.eventLoop), JSON.stringify({ chatWorkers: status0.queues?.chat?.workers, embedWorkers: status0.queues?.embed?.workers }));

// 1. 정상 호출(light) + 진행 알림
{
  const before = new Set((await runs()).map((item) => item.id));
  const { client } = await connect();
  const progress = [];
  const started = Date.now();
  const response = await client.callTool({ name: "augment_context", arguments: { query, effort: "light" } }, undefined, { onprogress: (p) => progress.push(p.progress), resetTimeoutOnProgress: true, timeout: 300_000 });
  const text = response.content.map((part) => part.text).join("");
  const header = text.split("\n---\n")[0];
  check("light: 중계로 정상 응답(머리 + 컨텍스트)", !response.isError && /^\[dualcontext\] effort=light coverage=ok/.test(header), header.replace(/\n/g, " | "));
  check("light: 진행 알림이 단조 증가로 왔다", progress.length > 0 && progress.every((value, i) => i === 0 || value > progress[i - 1]), JSON.stringify(progress));
  const run = await newRun(before);
  check("light: 실행 로그에 MCP 로 남았다", run?.source === "mcp" && run?.effort === "light" && run?.status === "ok", JSON.stringify({ id: run?.id, source: run?.source, status: run?.status }));
  result.light = { elapsedMs: Date.now() - started, header, runId: run?.id, progressCount: progress.length };
  await client.close();
}

// 2. 클라이언트 취소(middle 도중 요청 abort → 취소 알림)
{
  const before = new Set((await runs()).map((item) => item.id));
  const { client } = await connect();
  const controller = new AbortController();
  const pending = client.callTool({ name: "augment_context", arguments: { query, effort: "middle" } }, undefined, { signal: controller.signal, timeout: 3_600_000 }).catch((error) => String(error));
  let run;
  for (let i = 0; i < 40 && !run; i += 1) { await sleep(500); run = await newRun(before); }
  check("취소: middle 실행이 시작되어 running 이다", run?.status === "running", JSON.stringify({ id: run?.id, status: run?.status }));
  await sleep(8000);
  const midStatus = await api("/status");
  controller.abort();
  const began = Date.now();
  await pending;
  const closed = await waitRun(run.id, 30_000);
  check("취소: 취소 알림 뒤 실행이 error(취소됨)로 닫힌다", closed.status === "error" && /취소됨\(cancelled\)/.test(closed.error ?? ""), JSON.stringify({ status: closed.status, error: closed.error, afterMs: Date.now() - began }));
  await sleep(1000);
  const after = await api("/status");
  check("취소: 큐의 진행 중 요청이 0 으로 돌아오고 활성 실행이 없다", after.queues.chat.inFlight === 0 && after.activeRuns === 0, JSON.stringify({ inFlight: after.queues.chat.inFlight, queued: after.queues.chat.queued, activeRuns: after.activeRuns, midInFlight: midStatus.queues.chat.inFlight, midMax: midStatus.queues.chat.maxInFlight }));
  result.cancel = { runId: run.id, closed: { status: closed.status, error: closed.error }, midQueues: midStatus.queues.chat, afterQueues: after.queues.chat };
  await client.close();
}

// 3. 프로세스 종료(클라이언트가 stdio 를 닫음 = stdin EOF) → 실행 취소
{
  const before = new Set((await runs()).map((item) => item.id));
  const { client, transport } = await connect();
  const pending = client.callTool({ name: "augment_context", arguments: { query, effort: "middle" } }, undefined, { timeout: 3_600_000 }).catch((error) => String(error));
  let run;
  for (let i = 0; i < 40 && !run; i += 1) { await sleep(500); run = await newRun(before); }
  check("EOF: middle 실행이 시작되어 running 이다", run?.status === "running", JSON.stringify({ id: run?.id }));
  await sleep(5000);
  await transport.close();
  await pending;
  const closed = await waitRun(run.id, 30_000);
  check("EOF: stdio 가 닫히면 실행이 취소된다", closed.status === "error" && /취소됨/.test(closed.error ?? ""), JSON.stringify({ status: closed.status, error: closed.error }));
  result.eof = { runId: run.id, closed: { status: closed.status, error: closed.error } };
}

// 4. 계측
const status1 = await api("/status");
result.finalStatus = status1;
check("계측: 취소 건수가 기록되었다", status1.queues.chat.cancelled >= 0, JSON.stringify(status1.queues.chat));
result.finishedAt = new Date().toISOString();
writeFileSync(new URL("./mcp-verify_result.json", out), JSON.stringify(result, null, 2));
const failed = result.checks.filter((c) => !c.ok);
console.log(failed.length === 0 ? "ALL OK" : `FAILED ${failed.length}`);
process.exit(failed.length === 0 ? 0 : 1);
