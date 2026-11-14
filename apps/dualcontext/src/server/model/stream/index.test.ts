import assert from "node:assert/strict";
import test from "node:test";
import { readChatStream } from "./index.js";

const enc = new TextEncoder();
async function* chunks(parts: Uint8Array[]) {
  for (const part of parts) yield part;
}
const text = (parts: string[]) => chunks(parts.map((part) => enc.encode(part)));
const sse = (delta: object, finish: string | null = null) => `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\n\n`;

test("본문과 추론 길이를 모으고 [DONE]에서 정상 종료로 본다", async () => {
  const result = await readChatStream(text([sse({ reasoning_content: "abc" }), sse({ content: "안녕" }), sse({ content: "하세요" }, "stop"), "data: [DONE]\n\n"]));
  assert.deepEqual(result, { content: "안녕하세요", reasoningChars: 3, finished: true });
});

test("청크 경계가 줄·멀티바이트 문자 중간에 걸려도 이어 붙인다", async () => {
  const whole = enc.encode(sse({ content: "한글" }, "stop") + "data: [DONE]\n\n");
  const result = await readChatStream(chunks([whole.slice(0, 20), whole.slice(20, 37), whole.slice(37)]));
  assert.equal(result.content, "한글");
});

test("종료 표지 없이 끊기면 finished=false 로 알린다", async () => {
  const result = await readChatStream(text([sse({ content: "중간" })]));
  assert.equal(result.finished, false);
  assert.equal(result.content, "중간");
});

test("onChunk 는 청크마다 불리고 해석 불가한 줄은 무시한다", async () => {
  let calls = 0;
  const result = await readChatStream(text([": keep-alive\n", "data: {not json}\n", sse({ content: "x" }, "stop")]), () => {
    calls += 1;
  });
  assert.equal(calls, 3);
  assert.equal(result.content, "x");
});
