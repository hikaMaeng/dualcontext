/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { runPhase } from "./index";

test("진행 중 · 증강 끝남을 상태와 단계에서 읽는다", () => {
  assert.deepEqual(runPhase({ status: "running", stage: "augment" }), { running: true, augmentDone: false });
  assert.deepEqual(runPhase({ status: "running", stage: "answering" }), { running: true, augmentDone: true });
  assert.deepEqual(runPhase({ status: "ok", stage: "done" }), { running: false, augmentDone: true });
});

test("증강 단계에서 실패한 실행은 증강이 끝난 것이 아니다", () => {
  assert.deepEqual(runPhase({ status: "error", stage: "augment" }), { running: false, augmentDone: false });
  assert.deepEqual(runPhase({ status: "error", stage: null }), { running: false, augmentDone: false });
});
