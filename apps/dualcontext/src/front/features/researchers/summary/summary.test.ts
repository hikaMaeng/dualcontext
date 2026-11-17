/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Researcher } from "dualcontext_domain/common";
import { summarizeSource } from "./index";

const of = (type: Researcher["type"], config: Record<string, unknown>) => summarizeSource({ type, config });

test("유형마다 출처 한 줄이 나온다", () => {
  assert.deepEqual(of("pgvector", { table: "kb_law" }), { kind: "table", value: "kb_law" });
  assert.deepEqual(of("folder", { path: "docs" }), { kind: "folder", value: "docs" });
  assert.deepEqual(of("codebase", { source: "git", url: "https://x/y.git" }), { kind: "git", value: "https://x/y.git" });
  assert.deepEqual(of("codebase", { source: "directory", path: "workspace/a" }), { kind: "directory", value: "workspace/a" });
  assert.deepEqual(of("duckduckgo", { topK: 5 }), { kind: "web", value: "" });
});

test("크롤러는 첫 URL 과 나머지 개수를 보인다", () => {
  assert.deepEqual(of("crawler", { startUrls: ["https://a"] }), { kind: "crawler", value: "https://a" });
  assert.deepEqual(of("crawler", { startUrls: ["https://a", "https://b", "https://c"] }), { kind: "crawler", value: "https://a +2" });
  assert.deepEqual(of("crawler", { startUrls: [] }), { kind: "crawler", value: "" });
});

test("설정이 비었거나 모양이 달라도 던지지 않는다", () => {
  assert.deepEqual(of("pgvector", {}), { kind: "table", value: "" });
  assert.deepEqual(of("folder", { path: 3 }), { kind: "folder", value: "" });
  assert.deepEqual(of("crawler", { startUrls: "x" }), { kind: "crawler", value: "" });
  assert.deepEqual(summarizeSource({ type: "folder", config: null as unknown as Record<string, unknown> }), { kind: "folder", value: "" });
});
