import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { AiServerError, ChatStalledError, streamChat } from "./index.js";

const sse = (delta: object, finish: string | null = null) => `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\n\n`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withServer(handler: Parameters<typeof createServer>[1], run: (endpoint: { baseUrl: string; model: string; apiKey: string }) => Promise<void>) {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run({ baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, model: "m", apiKey: "" });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("토큰이 계속 오면 총 대기가 유휴 시간보다 길어도 끝까지 기다린다", async () => {
  await withServer(async (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (let i = 0; i < 6; i += 1) {
      res.write(sse({ reasoning_content: "생각" }));
      await sleep(50);
    }
    res.write(sse({ content: "답" }, "stop"));
    res.end("data: [DONE]\n\n");
  }, async (endpoint) => {
    assert.equal(await streamChat(endpoint, "q", { idleMs: 200, totalMs: 10_000 }), "답");
  });
});

test("유휴 시간 동안 아무것도 안 오면 멈춤 오류로 끊는다", async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(sse({ reasoning_content: "x" }));
  }, async (endpoint) => {
    const started = Date.now();
    await assert.rejects(streamChat(endpoint, "q", { idleMs: 150, totalMs: 10_000 }), (error: unknown) => error instanceof ChatStalledError && /no data/.test(error.message));
    assert.ok(Date.now() - started < 2000);
  });
});

test("총 시간 상한을 넘으면 끊는다", async () => {
  await withServer(async (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    while (!res.destroyed) {
      res.write(sse({ reasoning_content: "x" }));
      await sleep(20);
    }
  }, async (endpoint) => {
    await assert.rejects(streamChat(endpoint, "q", { idleMs: 1000, totalMs: 300 }), (error: unknown) => error instanceof ChatStalledError && /total time/.test(error.message));
  });
});

test("503 은 status 가 담긴 AiServerError 로 올라온다", async () => {
  await withServer((_req, res) => {
    res.writeHead(503, { "content-type": "application/json" });
    res.end('{"error":{"message":"no eligible backend has free capacity"}}');
  }, async (endpoint) => {
    await assert.rejects(streamChat(endpoint, "q", { idleMs: 500, totalMs: 5000 }), (error: unknown) => error instanceof AiServerError && error.status === 503);
  });
});

test("종료 표지 없이 스트림이 닫히면 오류, 스트리밍 미지원(JSON) 서버는 그대로 받는다", async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(sse({ content: "중간" }));
  }, async (endpoint) => {
    await assert.rejects(streamChat(endpoint, "q", { idleMs: 500, totalMs: 5000 }), ChatStalledError);
  });
  await withServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: " 한 번에 " } }] }));
  }, async (endpoint) => {
    assert.equal(await streamChat(endpoint, "q", { idleMs: 500, totalMs: 5000 }), "한 번에");
  });
});
