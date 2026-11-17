import assert from "node:assert/strict";
import test from "node:test";
import { NODE_TEXT_LIMIT } from "dualcontext_domain/common";
import type { ModelClient } from "../../model/index.js";
import { clipText, recordModel } from "./index.js";

const fakeModel = (chat: (prompt: string) => Promise<string>) => ({ chat, embed: async () => [[1]], settings: async () => ({ marker: "s" }), listModels: async () => ["m"] }) as unknown as ModelClient;

test("clipText: 한도 이하는 그대로, 넘으면 앞부분 + 생략 글자 수 표식", () => {
  assert.deepEqual(clipText("abc", 5), { text: "abc", truncated: false });
  const clipped = clipText("x".repeat(12), 5);
  assert.equal(clipped.truncated, true);
  assert.equal(clipped.text, "xxxxx\n…(이하 7자 생략)");
});

test("recordModel: 프롬프트 · 응답 · 소요를 순서대로 모으고 나머지 메서드는 위임한다", async () => {
  const { model, calls } = recordModel(fakeModel(async (prompt) => `답:${prompt}`), "analyze");
  assert.equal(await model.chat("a"), "답:a");
  assert.equal(await model.chat("b"), "답:b");
  assert.deepEqual(calls().map((c) => [c.seq, c.purpose, c.prompt, c.response, c.error]), [[1, "analyze", "a", "답:a", undefined], [2, "analyze", "b", "답:b", undefined]]);
  assert.equal(typeof calls()[0].ms, "number");
  assert.match(calls()[0].at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(await model.embed(["x"]), [[1]]);
  assert.deepEqual(await (model as unknown as { settings: () => Promise<unknown> }).settings(), { marker: "s" });
});

test("recordModel: 실패한 호출도 오류와 함께 남기고 그대로 던지며, purpose 가 없으면 필드가 없다", async () => {
  const { model, calls } = recordModel(fakeModel(async () => { throw new Error("유휴 시간 초과"); }));
  await assert.rejects(model.chat("p"), /유휴 시간 초과/);
  const [call] = calls();
  assert.equal(call.response, null);
  assert.equal(call.error, "유휴 시간 초과");
  assert.equal("purpose" in call, false);
});

test("recordModel: 긴 프롬프트 · 응답은 자르고 truncated 를 켠다. 원래 응답은 호출자에게 그대로 간다", async () => {
  const long = "y".repeat(NODE_TEXT_LIMIT + 1000);
  const { model, calls } = recordModel(fakeModel(async () => long));
  assert.equal((await model.chat(long)).length, long.length);
  const [call] = calls();
  assert.equal(call.truncated, true);
  assert.ok(call.prompt.length < long.length && call.prompt.endsWith("1000자 생략)"));
  assert.ok((call.response ?? "").endsWith("1000자 생략)"));
});

test("recordModel: 노드마다 따로 만든 래퍼는 병렬 호출이 섞이지 않고, seq 는 시작 순서다", async () => {
  const base = fakeModel(async (prompt) => { await new Promise((r) => setTimeout(r, prompt === "slow" ? 20 : 1)); return prompt; });
  const one = recordModel(base);
  const two = recordModel(base);
  await Promise.all([one.model.chat("slow"), one.model.chat("fast"), two.model.chat("other")]);
  assert.deepEqual(one.calls().map((c) => [c.seq, c.prompt]), [[1, "slow"], [2, "fast"]], "끝난 순서가 아니라 시작 순서");
  assert.deepEqual(two.calls().map((c) => c.prompt), ["other"]);
});
