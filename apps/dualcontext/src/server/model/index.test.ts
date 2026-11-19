import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type pg from "pg";
import { RunAborted } from "dualcontext_domain/common";
import { createModelClient, defaultChatControl, type ChatControl } from "./index.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sse = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;

type Hit = { path: string; at: number };

/** 추론 서버 흉내: 요청마다 handler 를 부르고, 동시에 처리 중인 요청 수의 최댓값을 센다. */
async function withInference(
  handler: (req: IncomingMessage, res: ServerResponse, hit: Hit, hits: Hit[]) => void | Promise<void>,
  run: (ctx: { pool: pg.Pool; hits: Hit[]; stats: { active: number; peak: number } }) => Promise<void>
) {
  const hits: Hit[] = [];
  const stats = { active: 0, peak: 0 };
  const server: Server = createServer(async (req, res) => {
    const hit = { path: req.url ?? "", at: Date.now() };
    hits.push(hit);
    stats.active += 1;
    stats.peak = Math.max(stats.peak, stats.active);
    res.on("close", () => { stats.active -= 1; });
    await handler(req, res, hit, hits);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const pool = {
    query: async () => ({ rows: [{ embedding_base_url: baseUrl, embedding_model: "em", embedding_api_key: "", chat_base_url: baseUrl, chat_model: "cm", chat_api_key: "" }] })
  } as unknown as pg.Pool;
  try {
    await run({ pool, hits, stats });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

const control = (over: Partial<ChatControl> = {}): ChatControl => ({ ...defaultChatControl, idleMs: 5_000, totalMs: 20_000, retryBaseMs: 10, ...over });
const answer = (res: ServerResponse, text = "답") => { res.writeHead(200, { "content-type": "text/event-stream" }); res.end(sse(text)); };

test("일시 오류(503)는 큐에 지연 재투입되어 성공하고, 시도 수가 결과에 담긴다", async () => {
  await withInference((_req, res, _hit, hits) => {
    if (hits.length === 1) { res.writeHead(503); res.end("busy"); return; }
    answer(res);
  }, async ({ pool, hits }) => {
    const model = createModelClient(pool, "", control());
    assert.deepEqual(await model.chatDetailed("q"), { text: "답", attempts: 2 });
    assert.equal(hits.length, 2);
    await model.close();
  });
});

test("재시도하지 않는 오류(400)는 한 번만 보내고 던진다", async () => {
  await withInference((_req, res) => { res.writeHead(400); res.end("bad"); }, async ({ pool, hits }) => {
    const model = createModelClient(pool, "", control());
    await assert.rejects(model.chat("q"), /answered 400/);
    assert.equal(hits.length, 1);
    await model.close();
  });
});

test("일시 오류가 계속되면 시도 상한(4번)에서 멈춘다(호출 하나가 HTTP 16번이 되지 않는다)", async () => {
  await withInference((_req, res) => { res.writeHead(502); res.end("upstream"); }, async ({ pool, hits }) => {
    const model = createModelClient(pool, "", control());
    await assert.rejects(model.chat("q"), /answered 502/);
    assert.equal(hits.length, control().attempts);
    await model.close();
  });
});

test("병렬성: 소비자 수만큼 추론 서버에 동시 요청이 나가고, 쉬는 소비자 없이 모두 끝난다", async () => {
  for (const workers of [3, 6]) {
    await withInference(async (_req, res) => { await sleep(40); answer(res); }, async ({ pool, stats }) => {
      const model = createModelClient(pool, "", control({ chatWorkers: workers }));
      const all = await Promise.all(Array.from({ length: 12 }, (_, i) => model.chat(`q${i}`)));
      assert.equal(all.length, 12);
      assert.equal(stats.peak, workers, `소비자 ${workers}개면 동시 요청의 최댓값도 ${workers}`);
      await model.close();
    });
  }
});

test("채팅 큐가 가득 차도 임베딩 큐는 독립적으로 흐른다(자원별 소비자)", async () => {
  await withInference(async (req, res) => {
    if (req.url?.endsWith("/embeddings")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ data: [{ index: 0, embedding: [1, 2] }] })); return; }
    await sleep(200);
    answer(res);
  }, async ({ pool }) => {
    const model = createModelClient(pool, "", control({ chatWorkers: 1 }));
    const slow = model.chat("느림");
    const queued = model.chat("대기");
    const started = Date.now();
    assert.deepEqual(await model.embed(["a"]), [[1, 2]]);
    assert.ok(Date.now() - started < 150, "임베딩이 채팅 큐 뒤에서 기다리면 안 된다");
    await Promise.all([slow, queued]);
    await model.close();
  });
});

test("forRun: 취소하면 진행 중 요청이 즉시 끊기고 RunAborted 로 끝나며, 같은 큐의 다음 요청이 이어서 처리된다", async () => {
  await withInference(async (req, res, hit, hits) => {
    if (hits.length === 1) { res.writeHead(200, { "content-type": "text/event-stream" }); res.write("data: {}\n\n"); return; }
    answer(res, "다음");
  }, async ({ pool }) => {
    const model = createModelClient(pool, "", control({ chatWorkers: 1 }));
    const controller = new AbortController();
    const run = model.forRun({ runKey: "r1", signal: controller.signal });
    const hanging = run.chat("멈춘다");
    const after = model.chat("다음");
    await sleep(40);
    const started = Date.now();
    controller.abort(new RunAborted("cancelled"));
    await assert.rejects(hanging, (error: unknown) => error instanceof RunAborted && error.reason === "cancelled");
    assert.ok(Date.now() - started < 500);
    assert.equal(await after, "다음");
    await model.close();
  });
});

test("forRun: 큐에서 기다리던 요청은 취소하면 서버에 한 번도 나가지 않는다", async () => {
  await withInference(async (_req, res) => { await sleep(80); answer(res); }, async ({ pool, hits }) => {
    const model = createModelClient(pool, "", control({ chatWorkers: 1 }));
    const first = model.chat("먼저");
    const controller = new AbortController();
    const waiting = model.forRun({ runKey: "r2", signal: controller.signal }).chat("대기");
    controller.abort(new RunAborted("cancelled"));
    await assert.rejects(waiting, RunAborted);
    await first;
    assert.equal(hits.length, 1);
    await model.close();
  });
});

test("취소는 재시도하지 않는다: 재시도 대기 중 취소하면 다시 나가지 않는다", async () => {
  await withInference((_req, res) => { res.writeHead(503); res.end("busy"); }, async ({ pool, hits }) => {
    const model = createModelClient(pool, "", control({ retryBaseMs: 200 }));
    const controller = new AbortController();
    const task = model.forRun({ runKey: "r3", signal: controller.signal }).chat("q");
    await sleep(60);
    controller.abort(new RunAborted("cancelled"));
    await assert.rejects(task, RunAborted);
    await sleep(300);
    assert.equal(hits.length, 1);
    await model.close();
  });
});

test("pinned: 설정을 DB 에서 다시 읽지 않고 고정된 엔드포인트를 쓴다", async () => {
  await withInference((_req, res) => answer(res, "고정"), async ({ pool }) => {
    let reads = 0;
    const counting = { query: async (...args: unknown[]) => { reads += 1; return (pool as unknown as { query: (...a: unknown[]) => Promise<unknown> }).query(...args); } } as unknown as pg.Pool;
    const model = createModelClient(counting, "", control());
    const ai = await model.settings();
    reads = 0;
    assert.equal(await model.pinned(ai).chat("q"), "고정");
    assert.equal(reads, 0);
    await model.close();
  });
});

test("stats: 큐 계측(소비자 수 · 발행 수 · 재시도 수)을 돌려준다", async () => {
  await withInference((_req, res, _hit, hits) => { if (hits.length === 1) { res.writeHead(503); res.end("x"); return; } answer(res); }, async ({ pool }) => {
    const model = createModelClient(pool, "", control({ chatWorkers: 2 }));
    await model.chat("q");
    const { chat } = model.stats();
    assert.equal(chat.workers, 2);
    assert.equal(chat.dispatched, 2);
    assert.equal(chat.retried, 1);
    await model.close();
  });
});
