// 실행 98번(답변 타임아웃 901s)의 증강 후 프롬프트를 제한 없이 스트리밍으로 재현한다. 추론/본문 토큰 진행을 30초마다 찍는다.
import { Agent, fetch } from "undici";
const run = await (await fetch("http://127.0.0.1:18081/api/admin/runs/98")).json();
const tmpl = run.settings.answer.after ?? run.settings.answer.afterPrompt;
const prompt = (typeof tmpl === "string" ? tmpl : JSON.stringify(tmpl)).replace("{{context}}", run.context).replaceAll("{{query}}", run.query);
console.log("prompt chars", prompt.length, "tmpl type", typeof tmpl);
const started = Date.now();
const res = await fetch("http://127.0.0.1:18180/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, dispatcher: new Agent({ headersTimeout: 3_600_000, bodyTimeout: 3_600_000 }),
  body: JSON.stringify({ model: "qwen36-35b", temperature: 0, stream: true, messages: [{ role: "user", content: prompt }] }) });
console.log("http", res.status, "headers after", Math.round((Date.now() - started) / 1000), "s");
let reasoning = 0, content = 0, last = Date.now(), buf = "", text = "";
for await (const chunk of res.body) {
  buf += Buffer.from(chunk).toString("utf8");
  let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
    try { const d = JSON.parse(line.slice(5)).choices?.[0]?.delta ?? {}; if (d.reasoning_content) reasoning += d.reasoning_content.length; if (d.content) { content += d.content.length; text += d.content; } } catch {} }
  if (Date.now() - last > 30000) { last = Date.now(); console.log(Math.round((Date.now() - started) / 1000) + "s reasoningChars", reasoning, "contentChars", content); }
}
console.log("DONE", Math.round((Date.now() - started) / 1000) + "s reasoningChars", reasoning, "contentChars", content);
console.log("answer head:", text.slice(0, 200));
