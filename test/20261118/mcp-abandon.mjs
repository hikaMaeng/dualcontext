// MCP 호출 도중 클라이언트가 연결을 끊으면 그 실행이 running 으로 남지 않고 error 로 닫히는지 확인한다.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFileSync } from "node:fs";

const base = process.env.DUALCONTEXT_URL ?? "http://127.0.0.1:18081";
const list = async () => (await (await fetch(`${base}/api/admin/runs?pageSize=100`)).json()).items;
const before = new Set((await list()).map((item) => item.id));
const transport = new StdioClientTransport({ command: "docker", args: ["exec", "-i", "dualcontext", "node", "/app/dist/server/index.js", "--stdio"] });
const client = new Client({ name: "mcp-abandon-check", version: "0.0.0" });
await client.connect(transport);
const pending = client.callTool({ name: "augment_context", arguments: { query: "연결 끊김 시험: 퇴직금 지급 기한" } }, undefined, { timeout: 900_000 }).catch((error) => String(error));
let running = null;
for (let i = 0; i < 40 && !running; i += 1) {
  await new Promise((r) => setTimeout(r, 250));
  running = (await list()).find((item) => !before.has(item.id) && item.status === "running") ?? null;
}
const seenRunning = running !== null;
await client.close();
await pending;
let final = null;
for (let i = 0; i < 20; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  final = (await list()).find((item) => !before.has(item.id)) ?? null;
  if (final && final.status !== "running") break;
}
const detail = final ? await (await fetch(`${base}/api/admin/runs/${final.id}`)).json() : null;
const result = { seenRunning, runId: final?.id ?? null, source: final?.source ?? null, status: final?.status ?? null, error: detail?.error ?? null };
writeFileSync(new URL("./mcp-abandon_result.json", import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
