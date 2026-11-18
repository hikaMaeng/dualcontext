// 배포된 컨테이너의 MCP stdio 서버를 실제로 호출하고, 실행 로그 API 에서 그 호출이 source=mcp 로 남았는지 확인한다.
// 사용: node test/20261118/mcp-run-log.mjs "<질의>"  (컨테이너 dualcontext 가 떠 있어야 한다)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFileSync } from "node:fs";

const query = process.argv[2] ?? "근로계약서 없이 일했을 때 퇴직금 청구 요건";
const base = process.env.DUALCONTEXT_URL ?? "http://127.0.0.1:18081";
const out = new URL("./mcp-run-log_result.json", import.meta.url);

const idsBefore = new Set((await (await fetch(`${base}/api/admin/runs?pageSize=100`)).json()).items.map((item) => item.id));
const transport = new StdioClientTransport({ command: "docker", args: ["exec", "-i", "dualcontext", "node", "/app/dist/server/index.js", "--stdio"] });
const client = new Client({ name: "mcp-run-log-check", version: "0.0.0" });
await client.connect(transport);
const tools = await client.listTools();
const started = Date.now();
const response = await client.callTool({ name: "augment_context", arguments: { query } }, undefined, { timeout: 900_000 });
const elapsedMs = Date.now() - started;
await client.close();

const page = await (await fetch(`${base}/api/admin/runs?pageSize=100`)).json();
const created = page.items.filter((item) => !idsBefore.has(item.id));
const detail = created.length === 1 ? await (await fetch(`${base}/api/admin/runs/${created[0].id}`)).json() : null;
const text = (response.content ?? []).map((part) => part.text ?? "").join("");
const result = {
  query,
  tools: tools.tools.map((tool) => tool.name),
  isError: response.isError ?? false,
  elapsedMs,
  responseChars: text.length,
  newRuns: created.map(({ id, source, status, query: q }) => ({ id, source, status, query: q })),
  detail: detail && {
    id: detail.id, source: detail.source, status: detail.status, stage: detail.stage, error: detail.error,
    answersKeys: Object.keys(detail.answers ?? {}), contextChars: (detail.context ?? "").length,
    contextEqualsResponse: (detail.context ?? "") === text
  }
};
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
