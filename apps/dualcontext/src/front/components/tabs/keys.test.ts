/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { nextTabId } from "./keys";

const ids = ["answer", "routing", "researchers", "context"];

test("오른쪽 · 왼쪽 화살표는 이웃 탭으로 가고 양 끝에서 이어진다", () => {
  assert.equal(nextTabId(ids, "answer", "ArrowRight", false), "routing");
  assert.equal(nextTabId(ids, "context", "ArrowRight", false), "answer");
  assert.equal(nextTabId(ids, "answer", "ArrowLeft", false), "context");
});

test("오른쪽에서 왼쪽으로 쓰는 언어에서는 화살표 방향이 반대다", () => {
  assert.equal(nextTabId(ids, "routing", "ArrowRight", true), "answer");
  assert.equal(nextTabId(ids, "routing", "ArrowLeft", true), "researchers");
});

test("Home · End 와 처리하지 않는 키", () => {
  assert.equal(nextTabId(ids, "routing", "Home", false), "answer");
  assert.equal(nextTabId(ids, "routing", "End", false), "context");
  assert.equal(nextTabId(ids, "routing", "Enter", false), null);
  assert.equal(nextTabId(ids, "nope", "ArrowRight", false), null);
});
