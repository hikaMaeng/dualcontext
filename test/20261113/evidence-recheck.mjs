// 고정된 실험 질의(F1·F2·F3)의 정답 인용문이 컨텍스트에 들어 있는지를 수정 전(저장된 실행)과 수정 후(MCP 새 호출)로 같은 기준으로 센다.
// LLM 답변은 만들지 않는다: MCP 도구 augment_context 는 컨텍스트만 돌려준다.
//   node test/20261113/evidence-recheck.mjs > test/20261113/evidence-recheck_result.json
// 기준: gold_facts[].quote 의 공백을 접은 앞 N자가 컨텍스트(공백 접음)에 들어 있으면 「포함」.
//       인용이 짧으면 인용 전체, 길면 앞 80자 + 뒤 80자가 모두 있어야 포함으로 센다(앞부분만 맞고 잘린 경우를 걸러낸다).
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve("apps/dualcontext/seed-data/domains/_experiments");
const sessions = ["F1", "F2", "F3"];
const norm = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

function present(context, quote) {
  const q = norm(quote);
  if (q === "") return null;
  const haystack = norm(context);
  if (q.length <= 160) return haystack.includes(q);
  return haystack.includes(q.slice(0, 80)) && haystack.includes(q.slice(-80));
}

/** MCP stdio 로 질의 하나를 호출해 컨텍스트 텍스트를 받는다. */
function mcpContext(query) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", "dualcontext", "node", "/app/dist/server/index.js", "--stdio"], { stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
      for (const line of out.split("\n")) {
        if (!line.trim().startsWith("{")) continue;
        const message = JSON.parse(line);
        if (message.id === 2) {
          child.stdin.end();
          resolve(message.result.content[0].text);
        }
      }
    });
    child.on("error", reject);
    const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "recheck", version: "0" } } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "augment_context", arguments: { query } } });
    setTimeout(() => reject(new Error("mcp timeout")), 180_000);
  });
}

const rows = [];
for (const session of sessions) {
  const queries = JSON.parse(readFileSync(path.join(root, session, "queries.json"), "utf8"));
  for (const entry of queries.queries ?? queries) {
    const runFile = ["", `-${entry.id}`].map((suffix) => path.join(root, session, "runs", `${entry.id}.json`))[0];
    const old = JSON.parse(readFileSync(runFile, "utf8"));
    const oldContext = (old.body ?? old).context;
    const fresh = await mcpContext(entry.query);
    for (const fact of entry.gold_facts ?? []) {
      rows.push({
        session, query: entry.id, fact: fact.id, table: fact.source_table, row: fact.source_row_id,
        quoteChars: norm(fact.quote).length,
        before: present(oldContext, fact.quote),
        after: present(fresh, fact.quote)
      });
    }
    process.stderr.write(`${session}/${entry.id} done\n`);
  }
}

const count = (key) => rows.filter((row) => row[key] === true).length;
const total = rows.filter((row) => row.before !== null).length;
console.log(JSON.stringify({ criterion: "gold quote (whitespace-folded) present in context", facts: total, before: count("before"), after: count("after"), rows }, null, 2));
