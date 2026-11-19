import assert from "node:assert/strict";
import test from "node:test";
import { RunAborted } from "dualcontext_domain/common";
import { AiServerError, ChatStalledError, EmptyContentError } from "../chat/index.js";
import { StreamLimitError } from "../stream/index.js";
import { backoffMs, isTransient } from "./index.js";

test("일시 오류: 서버 과다 · 일시 장애 상태 코드, 네트워크 단절, 유휴 중단, 빈 응답", () => {
  for (const status of [429, 500, 502, 503, 504]) assert.equal(isTransient(new AiServerError(status, "/x", "")), true, String(status));
  assert.equal(isTransient(new TypeError("fetch failed")), true);
  assert.equal(isTransient(Object.assign(new Error("reset"), { code: "ECONNRESET" })), true);
  assert.equal(isTransient(new ChatStalledError("chat produced no data for 600s")), true);
  assert.equal(isTransient(new EmptyContentError("empty")), true);
});

test("재시도하지 않는 오류: 취소 · 총 시간 상한 · 스트림 가드 · 4xx · 일반 오류", () => {
  assert.equal(isTransient(new RunAborted("cancelled")), false);
  assert.equal(isTransient(new ChatStalledError("chat exceeded total time limit of 3600s")), false);
  assert.equal(isTransient(new StreamLimitError("too big")), false);
  for (const status of [400, 401, 404]) assert.equal(isTransient(new AiServerError(status, "/x", "")), false, String(status));
  assert.equal(isTransient(new Error("설정 오류")), false);
});

test("백오프: 지수로 늘고 ±25% 지터 안에 든다", () => {
  assert.equal(backoffMs(1000, 1, () => 0.5), 1000);
  assert.equal(backoffMs(1000, 2, () => 0.5), 2000);
  assert.equal(backoffMs(1000, 3, () => 0), 3000);
  assert.equal(backoffMs(1000, 3, () => 1), 5000);
});
