import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../index.js";
import type { ToolRunner } from "../tools/augment/run/index.js";
import { createCancelAwareTransport } from "./index.js";

/** 보낸 메시지를 모으고 받은 메시지를 흉내 내는 가짜 안쪽 transport. */
function fakeInner() {
  const sent: JSONRPCMessage[] = [];
  const inner: Transport = {
    start: async () => undefined,
    close: async () => { inner.onclose?.(); },
    send: async (message) => { sent.push(message); }
  };
  return { inner, sent, receive: (message: object) => inner.onmessage?.(message as JSONRPCMessage) };
}
const call = (id: number | string) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "augment_context", arguments: { query: "q" } } });
const cancel = (requestId: number | string) => ({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId } });

test("요청을 수신하는 즉시 신호가 등록된다(핸들러가 아직 돌지 않아도)", () => {
  const { inner, receive } = fakeInner();
  const transport = createCancelAwareTransport(inner);
  transport.onmessage = () => undefined;
  receive(call(5));
  assert.ok(transport.signalFor(5));
  assert.equal(transport.signalFor(5)?.aborted, false);
});

test("요청 ID 0 취소 알림도 직접 처리한다(SDK 는 falsy id 를 건너뛴다)", () => {
  const { inner, receive } = fakeInner();
  const transport = createCancelAwareTransport(inner);
  transport.onmessage = () => undefined;
  receive(call(0));
  receive(cancel(0));
  assert.equal(transport.signalFor(0)?.aborted, true);
});

test("취소된 요청의 응답은 보내지 않고, 다른 요청의 응답은 그대로 보낸다", async () => {
  const { inner, sent, receive } = fakeInner();
  const transport = createCancelAwareTransport(inner);
  transport.onmessage = () => undefined;
  receive(call(1));
  receive(call(2));
  receive(cancel(1));
  await transport.send({ jsonrpc: "2.0", id: 1, result: { content: [] } } as JSONRPCMessage);
  await transport.send({ jsonrpc: "2.0", id: 2, result: { content: [] } } as JSONRPCMessage);
  assert.deepEqual(sent.map((message) => (message as { id: number }).id), [2]);
  assert.equal(transport.signalFor(2), undefined, "응답을 보낸 요청은 정리된다");
});

test("abortAll: 진행 중인 모든 요청을 취소한다(stdin EOF)", () => {
  const { inner, receive } = fakeInner();
  const transport = createCancelAwareTransport(inner);
  transport.onmessage = () => undefined;
  receive(call(1));
  receive(call("a"));
  transport.abortAll();
  assert.equal(transport.signalFor(1)?.aborted, true);
  assert.equal(transport.signalFor("a")?.aborted, true);
});

test("onclose 는 덮어쓰지 않고 체인한다: SDK 의 처리도 불리고 진행 중 요청도 취소된다", async () => {
  const { inner, receive } = fakeInner();
  const transport = createCancelAwareTransport(inner);
  let sdkClosed = false;
  transport.onmessage = () => undefined;
  transport.onclose = () => { sdkClosed = true; };
  receive(call(1));
  await transport.close();
  assert.equal(sdkClosed, true);
  assert.equal(transport.signalFor(1)?.aborted, true);
});

test("MCP 서버 연결: 진행 토큰이 있으면 단조 증가하는 진행 알림이 가고, 응답에는 실행기 결과가 담긴다", async () => {
  const runner: ToolRunner = async (_args, { progress }) => {
    progress("analyze");
    progress("build");
    progress("done");
    return { isError: false, text: "[dualcontext] effort=light coverage=ok sources=1 elapsed=0s\nnext: -\n---\n본문" };
  };
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const adapted = createCancelAwareTransport(serverSide);
  await createMcpServer(runner, adapted).connect(adapted);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(clientSide);
  const seen: number[] = [];
  const result = await client.callTool({ name: "augment_context", arguments: { query: "q" } }, undefined, { onprogress: (progress) => seen.push(progress.progress), resetTimeoutOnProgress: true });
  assert.deepEqual(seen, [1, 2, 3]);
  assert.match((result.content as { text: string }[])[0].text, /본문$/);
  await client.close();
});

test("MCP 서버 연결: 클라이언트가 요청을 취소하면 실행기의 신호가 abort 된다", async () => {
  let started: () => void = () => undefined;
  const running = new Promise<void>((resolve) => { started = resolve; });
  let aborted = false;
  const runner: ToolRunner = async (_args, { signal }) => {
    started();
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
    return { isError: true, text: "cancelled" };
  };
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const adapted = createCancelAwareTransport(serverSide);
  await createMcpServer(runner, adapted).connect(adapted);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(clientSide);
  const controller = new AbortController();
  const pending = client.callTool({ name: "augment_context", arguments: { query: "q" } }, undefined, { signal: controller.signal }).catch(() => "aborted");
  await running;
  controller.abort();
  await pending;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(aborted, true);
  await client.close();
});
