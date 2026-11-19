import assert from "node:assert/strict";
import test from "node:test";
import { cleanQuery, webSearchQuery } from "./index.js";

test("답에서 검색어 한 줄만 꺼낸다: 접두어 · 따옴표 · 둘째 줄 제거, 빈 답 · 너무 긴 답은 null", () => {
  assert.equal(cleanQuery("coding agent turn loop implementation"), "coding agent turn loop implementation");
  assert.equal(cleanQuery('검색어: "AI 코딩 에이전트 turn loop"\n설명...'), "AI 코딩 에이전트 turn loop");
  assert.equal(cleanQuery("\n\n"), null);
  assert.equal(cleanQuery("가".repeat(121)), null);
});

test("모델 실패 · 빈 답이면 질의 원문을 쓴다", async () => {
  assert.equal(await webSearchQuery(async () => "agent loop source code", "vibeagent 의 turn loop"), "agent loop source code");
  assert.equal(await webSearchQuery(async () => { throw new Error("down"); }, "원문"), "원문");
  assert.equal(await webSearchQuery(async () => "", "원문"), "원문");
});

test("취소는 원문 폴백으로 삼키지 않고 다시 던진다", async () => {
  const cancelled = Object.assign(new Error("cancelled"), { name: "RunAborted" });
  await assert.rejects(webSearchQuery(async () => { throw cancelled; }, "원문"), (error) => error === cancelled);
  await assert.rejects(webSearchQuery(async () => { throw new DOMException("aborted", "AbortError"); }, "원문"), (error) => (error as Error).name === "AbortError");
});
