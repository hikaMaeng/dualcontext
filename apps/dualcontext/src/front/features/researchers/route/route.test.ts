/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResearchersHash, viewHash } from "./index";

test("해시를 목록 · 새로 만들기 · 뷰로 나눈다", () => {
  assert.deepEqual(parseResearchersHash("#researchers"), { kind: "list" });
  assert.deepEqual(parseResearchersHash("#researchers/new"), { kind: "new" });
  assert.deepEqual(parseResearchersHash("#researchers/12"), { kind: "view", id: 12 });
  assert.equal(viewHash(7), "#researchers/7");
});

test("알 수 없는 경로는 목록으로 본다", () => {
  assert.deepEqual(parseResearchersHash(""), { kind: "list" });
  assert.deepEqual(parseResearchersHash("#researchers/abc"), { kind: "list" });
  assert.deepEqual(parseResearchersHash("#researchers/12/x"), { kind: "list" });
  assert.deepEqual(parseResearchersHash("#researchers/-3"), { kind: "list" });
});
