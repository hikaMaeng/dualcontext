import assert from "node:assert/strict";
import test from "node:test";
import { readChatStream, StreamLimitError } from "./index.js";

const enc = new TextEncoder();
const sse = (delta: object, finish: string | null = null) => `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\n\n`;

test("누적 content 가 상한을 넘으면 수신 중에 StreamLimitError 로 멈춘다", async () => {
  async function* body() {
    for (let i = 0; i < 100; i += 1) yield enc.encode(sse({ content: "x".repeat(100) }));
  }
  await assert.rejects(readChatStream(body(), undefined, undefined, { maxContentChars: 1000, maxLineChars: 1_000_000 }), StreamLimitError);
});

test("개행 없는 입력이 줄 상한을 넘으면 StreamLimitError 로 멈춘다(버퍼가 끝없이 자라지 않는다)", async () => {
  async function* body() {
    for (let i = 0; i < 100; i += 1) yield enc.encode("x".repeat(1000));
  }
  await assert.rejects(readChatStream(body(), undefined, undefined, { maxContentChars: 1_000_000, maxLineChars: 5000 }), StreamLimitError);
});

test("종료 표지([DONE]) 뒤에는 더 읽지 않고 스트림을 닫는다", async () => {
  let produced = 0;
  let closed = false;
  async function* body() {
    try {
      yield enc.encode(sse({ content: "답" }, "stop") + "data: [DONE]\n\n");
      produced += 1;
      yield enc.encode(sse({ content: "표지 뒤" }));
      produced += 1;
    } finally {
      closed = true;
    }
  }
  const result = await readChatStream(body());
  assert.equal(result.content, "답");
  assert.equal(result.finished, true);
  assert.equal(produced, 0, "표지가 있는 청크에서 멈춘다: 다음 청크를 요청하면 연결이 계속 열려 있다");
  assert.equal(closed, true, "반복자가 정리되어 연결이 닫힌다");
});
