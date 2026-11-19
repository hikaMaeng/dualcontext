// 배포된 컨테이너에서 코드베이스 조사원(git 클론 → cpu.build 스레드로 색인 → cpu.search 스레드로 검색)이 실제로 도는지 확인한다.
// 임시 조사원을 만들고(공개 레포 하나), MCP light 호출을 한 뒤, 컨텍스트에 그 조사원 섹션이 있는지와 컨테이너 로그의 오류 · 이벤트 루프 지연을 본다. 끝나면 조사원을 지운다.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const base = process.env.DUALCONTEXT_URL ?? "http://127.0.0.1:18081";
const out = new URL("./verify/", import.meta.url);
mkdirSync(out, { recursive: true });
const api = async (path, init) => {
  const response = await fetch(`${base}/api/admin${path}`, init);
  const text = await response.text();
  try { return { status: response.status, body: JSON.parse(text) }; } catch { return { status: response.status, body: text }; }
};
const json = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const created = await api("/researchers", json("POST", {
  name: "PDFit 코드베이스(검증용 임시)",
  description: "PDFit PDF 변환 서비스의 소스코드. 함수 · 클래스 · 호출 구조",
  keywords: ["PDFit", "PDF 변환", "소스코드", "함수", "클래스"],
  enabled: true,
  type: "codebase",
  config: { source: "git", url: "https://github.com/hikaMaeng/PDFit", maxFiles: 800, maxRepoMB: 50, maxIndexSeconds: 120, topK: 5 }
}));
console.log("created", created.status, created.body?.id ?? JSON.stringify(created.body).slice(0, 200));
const id = created.body?.id;
const result = { createdStatus: created.status, researcherId: id };
try {
  await api("/status"); // eventLoop 히스토그램을 비운다
  const transport = new StdioClientTransport({ command: "docker", args: ["exec", "-i", "dualcontext", "node", "/app/dist/server/index.js", "--stdio"] });
  const client = new Client({ name: "codebase-check", version: "0.0.0" });
  await client.connect(transport);
  const query = "PDFit 소스코드에서 PDF 변환을 처리하는 함수와 클래스가 어디에 있고 서로 어떻게 호출하나";
  const rounds = [];
  for (let i = 0; i < 2; i += 1) {
    const started = Date.now();
    const response = await client.callTool({ name: "augment_context", arguments: { query, effort: "light" } }, undefined, { timeout: 900_000 });
    const text = response.content.map((part) => part.text).join("");
    rounds.push({ round: i + 1, elapsedMs: Date.now() - started, isError: response.isError ?? false, header: text.split("\n---\n")[0], hasSection: text.includes("PDFit 코드베이스"), chars: text.length, sample: text.slice(text.indexOf("PDFit 코드베이스"), text.indexOf("PDFit 코드베이스") + 400) });
    console.log(JSON.stringify({ ...rounds.at(-1), sample: undefined }));
    await sleep(500);
  }
  await client.close();
  result.rounds = rounds;
  const status = await api("/status");
  result.eventLoop = status.body.eventLoop;
  result.queues = status.body.queues;
  result.logTail = execSync("docker logs --tail 40 dualcontext 2>&1", { encoding: "utf8" }).split("\n").filter((line) => /error|Error|worker|codebase|index/i.test(line)).slice(-15);
} finally {
  if (id) console.log("deleted", (await api(`/researchers/${id}`, { method: "DELETE" })).status);
}
writeFileSync(new URL("./codebase-worker-check_result.json", out), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ eventLoop: result.eventLoop, logTail: result.logTail }, null, 1));
