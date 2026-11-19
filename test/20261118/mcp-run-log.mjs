// 배포된 컨테이너의 MCP stdio 서버를 실제로 호출하고, 실행 로그 API 에서 그 호출이 source=mcp · effort 와 함께 남았는지 확인한다.
// 사용: node test/20261118/mcp-run-log.mjs "<질의>" [light|middle|high|xhigh]   (effort 를 생략하면 인자를 보내지 않는다 = 기본 light)
// 컨테이너 dualcontext 가 떠 있어야 한다.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFileSync } from "node:fs";

const query = process.argv[2] ?? "근로계약서 없이 일했을 때 퇴직금 청구 요건";
const effort = process.argv[3];
const base = process.env.DUALCONTEXT_URL ?? "http://127.0.0.1:18081";
const out = new URL(`./rerun-final/mcp-run-log_${effort ?? "default"}_result.json`, import.meta.url);

const listRuns = async () => (await (await fetch(`${base}/api/admin/runs?pageSize=100`)).json()).items;
const idsBefore = new Set((await listRuns()).map((item) => item.id));
const transport = new StdioClientTransport({ command: "docker", args: ["exec", "-i", "dualcontext", "node", "/app/dist/server/index.js", "--stdio"] });
const client = new Client({ name: "mcp-run-log-check", version: "0.0.0" });
await client.connect(transport);
const tools = await client.listTools();
const started = Date.now();
const response = await client.callTool({ name: "augment_context", arguments: effort ? { query, effort } : { query } }, undefined, { timeout: 14_400_000 });
const elapsedMs = Date.now() - started;
await client.close();

const created = (await listRuns()).filter((item) => !idsBefore.has(item.id));
const detail = created.length === 1 ? await (await fetch(`${base}/api/admin/runs/${created[0].id}`)).json() : null;
const text = (response.content ?? []).map((part) => part.text ?? "").join("");
const divider = "\n---\n";
const result = {
  query,
  effortArg: effort ?? null,
  tools: tools.tools.map((tool) => tool.name),
  inputSchemaKeys: Object.keys(tools.tools[0].inputSchema.properties ?? {}),
  descriptionHasWarning: /WARNING, long-running/.test(tools.tools[0].description ?? "") && /cannot be cancelled/.test(tools.tools[0].description ?? ""),
  effortDescriptionHasTime: /tens of minutes to over an hour/.test(tools.tools[0].inputSchema.properties?.effort?.description ?? ""),
  isError: response.isError ?? false,
  elapsedMs,
  responseChars: text.length,
  header: text.split(divider)[0],
  newRuns: created.map(({ id, source, effort: e, status, query: q }) => ({ id, source, effort: e, status, query: q })),
  detail: detail && {
    id: detail.id,
    source: detail.source,
    effort: detail.effort,
    planMode: detail.settings?.plan?.mode,
    maxRounds: detail.settings?.plan?.reevaluate?.maxRounds,
    planStop: detail.plan?.stop ?? null,
    status: detail.status,
    stage: detail.stage,
    error: detail.error,
    answersKeys: Object.keys(detail.answers ?? {}),
    contextChars: (detail.context ?? "").length,
    contextInResponse: text.includes(divider) && text.slice(text.indexOf(divider) + divider.length) === (detail.context ?? "")
  }
};
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
