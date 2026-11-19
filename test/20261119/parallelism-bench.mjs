// 게이트웨이 대조 측정: 같은 가짜 추론 서버에 대해 옛 방식(프로세스별 제한기 3 + 모델 층 503/429 재시도 4 × 계획 층 withAttempts 4)과 새 방식(큐 + 소비자 9)을 비교한다.
// 측정하는 것: 서버가 본 동시 요청 최댓값 · 완료 시간 · 총 HTTP 요청 수(재시도 증폭) · 이벤트 루프 지연.
// 옛 방식은 커밋 8ace667 의 model/limit 와 plan/ports withAttempts 를 그대로 옮긴 것이다(백오프 기준만 시험 시간에 맞춰 줄였다).
// 사용: node --import tsx test/20261119/parallelism-bench.mjs
import { createServer } from "node:http";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { writeFileSync, mkdirSync } from "node:fs";
import { createModelClient, defaultChatControl } from "../../apps/dualcontext/src/server/model/index.ts";
import { AiServerError } from "../../apps/dualcontext/src/server/model/chat/index.ts";

const out = new URL("./verify/", import.meta.url);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sse = (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;

/** 가짜 추론 서버. behavior(id, nth) 가 {status} 또는 {latency} 를 정한다. */
async function inferenceServer(latencyMs, behavior = () => null) {
  const hits = new Map();
  const stats = { total: 0, active: 0, peak: 0 };
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const id = JSON.parse(body).messages?.[0]?.content ?? "e";
    const nth = (hits.get(id) ?? 0) + 1;
    hits.set(id, nth);
    stats.total += 1;
    stats.active += 1;
    stats.peak = Math.max(stats.peak, stats.active);
    res.on("close", () => { stats.active -= 1; });
    const decided = behavior(id, nth);
    await sleep(latencyMs);
    if (decided?.status) { res.writeHead(decided.status); res.end("x"); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(sse("답"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, stats, close: () => { server.closeAllConnections(); server.close(); } };
}
const poolFor = (baseUrl) => ({ query: async () => ({ rows: [{ embedding_base_url: baseUrl, embedding_model: "em", embedding_api_key: "", chat_base_url: baseUrl, chat_model: "cm", chat_api_key: "" }] }) });

// ---- 옛 방식(8ace667): 프로세스별 제한기(3) + retryOverloaded(503/429, 총 4번) + 계획 층 withAttempts(모든 오류, 총 4번, 대기 없음)
function createLimiter(max) {
  let active = 0;
  const waiting = [];
  return async (task) => {
    if (active >= max) await new Promise((resolve) => waiting.push(resolve));
    else active += 1;
    try { return await task(); } finally { const next = waiting.shift(); if (next) next(); else active -= 1; }
  };
}
async function retryOverloaded(task, { attempts, baseMs }) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await task(); } catch (error) {
      const status = error?.status;
      if ((status !== 503 && status !== 429) || attempt >= attempts) throw error;
      await sleep(baseMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5));
    }
  }
}
async function withAttempts(run, attempts = 4) {
  let last;
  for (let i = 1; i <= attempts; i += 1) { try { return await run(); } catch (error) { last = error; } }
  throw last;
}
async function oldChat(baseUrl, limit, prompt, retryBaseMs) {
  const call = () => limit(() => retryOverloaded(async () => {
    const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "cm", stream: true, messages: [{ role: "user", content: prompt }] }) });
    if (!response.ok) throw new AiServerError(response.status, "/chat/completions", await response.text());
    await response.text();
    return "답";
  }, { attempts: 4, baseMs: retryBaseMs }));
  return withAttempts(call);
}

const histogram = monitorEventLoopDelay({ resolution: 5 });
async function measure(name, fn) {
  histogram.reset();
  histogram.enable();
  const started = Date.now();
  const detail = await fn();
  histogram.disable();
  return { name, elapsedMs: Date.now() - started, eventLoopP99Ms: Math.round(histogram.percentile(99) / 1e4) / 100, ...detail };
}
const settledCount = (results) => ({ ok: results.filter((r) => r.status === "fulfilled").length, failed: results.filter((r) => r.status === "rejected").length });

const results = { startedAt: new Date().toISOString(), scenarios: [] };
const run = async (title, latencyMs, requests, behavior, retryBaseMs) => {
  const scenario = { title, latencyMs, requests, retryBaseMs, old: null, now: null };
  // 옛 방식: HTTP 서버 프로세스 + stdio 프로세스가 각자 제한기 3 을 가진다(합산 최대 6). 요청은 두 프로세스에 반씩 간다.
  {
    const server = await inferenceServer(latencyMs, behavior);
    const limits = [createLimiter(3), createLimiter(3)];
    scenario.old = await measure("old", async () => {
      const settled = await Promise.allSettled(Array.from({ length: requests }, (_, i) => oldChat(server.baseUrl, limits[i % 2], `r${i}`, retryBaseMs)));
      return { ...settledCount(settled), serverPeak: server.stats.peak, httpRequests: server.stats.total };
    });
    server.close();
  }
  // 새 방식: 엔진 소유 프로세스 하나, 채팅 소비자 9(기본).
  {
    const server = await inferenceServer(latencyMs, behavior);
    const model = createModelClient(poolFor(server.baseUrl), "", { ...defaultChatControl, idleMs: 5000, totalMs: 30000, retryBaseMs });
    scenario.now = await measure("now", async () => {
      const settled = await Promise.allSettled(Array.from({ length: requests }, (_, i) => model.chat(`r${i}`)));
      return { ...settledCount(settled), serverPeak: server.stats.peak, httpRequests: server.stats.total, queue: model.stats().chat };
    });
    await model.close();
    server.close();
  }
  results.scenarios.push(scenario);
  console.log(JSON.stringify({ title, old: { ...scenario.old, queue: undefined }, now: { ...scenario.now, queue: undefined } }));
};

// A. 정상: 지연 200ms, 요청 90개. 처리량 = 동시 요청 수.
await run("A 정상(지연 200ms, 90건)", 200, 90, () => null, 10);
// B. 처음 두 번 503 이 나는 요청 40%: 둘 다 재시도로 성공해야 하고, 총 HTTP 수가 같아야 한다.
await run("B 일시 503(40% 요청이 앞 2번 실패)", 100, 60, (id, nth) => (Number(id.slice(1)) % 5 < 2 && nth <= 2 ? { status: 503 } : null), 10);
// C. 장애: 서버가 계속 503 → 호출 하나가 몇 번 HTTP 를 만드는가(재시도 증폭).
await run("C 계속 503(장애, 12건)", 50, 12, () => ({ status: 503 }), 10);
// D. 장애: 서버가 계속 502(게이트웨이 오류) → 옛 방식은 계획 층이 대기 없이 4번 두드린다.
await run("D 계속 502(장애, 12건)", 50, 12, () => ({ status: 502 }), 10);

results.finishedAt = new Date().toISOString();
writeFileSync(new URL("./parallelism-bench_result.json", out), JSON.stringify(results, null, 2));
process.exit(0);
