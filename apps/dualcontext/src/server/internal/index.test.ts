import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createRelayRunner } from "../mcp/relay/index.js";
import type { ToolRunner } from "../mcp/tools/augment/run/index.js";
import { createInternalApp, listenInternal } from "./index.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withInternal(runner: ToolRunner, run: (ctx: { baseUrl: string; relay: ToolRunner }) => Promise<void>, intervalMs = 15_000) {
  const server: Server = await listenInternal(createInternalApp(runner, intervalMs), 0);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run({ baseUrl, relay: createRelayRunner(baseUrl) });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

const never = new AbortController().signal;

test("중계: 진행 줄은 진행 알림으로, 마지막 결과 줄은 도구 응답으로 돌아온다", async () => {
  const runner: ToolRunner = async (_args, { progress }) => {
    progress("analyze");
    progress("build");
    return { isError: false, text: "머리\n---\n본문" };
  };
  await withInternal(runner, async ({ relay }) => {
    const seen: string[] = [];
    const reply = await relay({ query: "q", effort: "light" }, { signal: never, progress: (message) => seen.push(message) });
    assert.deepEqual(reply, { isError: false, text: "머리\n---\n본문" });
    assert.deepEqual(seen, ["analyze", "build"]);
  });
});

test("정상 완료는 취소가 아니다: 요청 close 는 정상 완료에도 발생하지만 신호는 abort 되지 않는다", async () => {
  let abortedAtEnd: boolean | null = null;
  const runner: ToolRunner = async (_args, { signal }) => {
    await sleep(60);
    abortedAtEnd = signal.aborted;
    return { isError: false, text: "ok" };
  };
  await withInternal(runner, async ({ relay }) => {
    const reply = await relay({ query: "q", effort: "light" }, { signal: never, progress: () => undefined });
    assert.equal(reply.text, "ok");
    assert.equal(abortedAtEnd, false);
  });
});

test("연결 이탈: 클라이언트가 끊으면 실행기의 신호가 abort 된다", async () => {
  let observed: () => void = () => undefined;
  const aborted = new Promise<void>((resolve) => { observed = resolve; });
  let started: () => void = () => undefined;
  const running = new Promise<void>((resolve) => { started = resolve; });
  const runner: ToolRunner = async (_args, { signal }) => {
    started();
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => { observed(); resolve(); }, { once: true }));
    return { isError: true, text: "cancelled" };
  };
  await withInternal(runner, async ({ relay }) => {
    const controller = new AbortController();
    const call = relay({ query: "q", effort: "light" }, { signal: controller.signal, progress: () => undefined });
    await running;
    const began = Date.now();
    controller.abort();
    const reply = await call;
    assert.equal(reply.isError, true);
    await aborted;
    assert.ok(Date.now() - began < 1000, "이탈을 즉시 알아챈다");
  });
});

test("heartbeat: 진행이 없어도 주기마다 진행 줄이 간다", async () => {
  const runner: ToolRunner = async () => { await sleep(120); return { isError: false, text: "끝" }; };
  await withInternal(runner, async ({ relay }) => {
    const seen: string[] = [];
    await relay({ query: "q", effort: "light" }, { signal: never, progress: (message) => seen.push(message) });
    assert.ok(seen.filter((message) => message === "working").length >= 2, `heartbeat: ${seen.join(",")}`);
  }, 30);
});

test("실행기가 던지면 오류 결과 줄을 돌려준다", async () => {
  const runner: ToolRunner = async () => { throw new Error("라우팅 실패"); };
  await withInternal(runner, async ({ relay }) => {
    const reply = await relay({ query: "q", effort: "light" }, { signal: never, progress: () => undefined });
    assert.equal(reply.isError, true);
    assert.match(reply.text, /라우팅 실패/);
  });
});

test("잘못된 본문은 400", async () => {
  await withInternal(async () => ({ isError: false, text: "x" }), async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/internal/augment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "", effort: "nope" }) });
    assert.equal(response.status, 400);
  });
});

test("서버가 없으면 직접 실행으로 폴백하지 않고 명확한 오류를 돌려준다", async () => {
  const relay = createRelayRunner("http://127.0.0.1:1");
  const reply = await relay({ query: "q", effort: "light" }, { signal: never, progress: () => undefined });
  assert.equal(reply.isError, true);
  assert.match(reply.text, /dualcontext server is not reachable/);
});
