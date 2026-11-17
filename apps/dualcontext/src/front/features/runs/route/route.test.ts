/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { LIST_HASH, nodeHash, parseRunsHash, viewHash } from "./index";

test("#runs 와 알 수 없는 해시는 목록이다", () => {
  assert.deepEqual(parseRunsHash(LIST_HASH), { kind: "list" });
  assert.deepEqual(parseRunsHash("#runs/abc"), { kind: "list" });
  assert.deepEqual(parseRunsHash("#runs/"), { kind: "list" });
  assert.deepEqual(parseRunsHash(""), { kind: "list" });
});

test("#runs/<id> 는 뷰이고 viewHash 와 서로 되돌릴 수 있다", () => {
  assert.deepEqual(parseRunsHash("#runs/227"), { kind: "view", id: 227 });
  assert.deepEqual(parseRunsHash(viewHash(5)), { kind: "view", id: 5 });
});

test("#runs/<id>/node/<키> 는 노드 화면이고 nodeHash 와 서로 되돌릴 수 있다(키의 : 는 인코딩된다)", () => {
  assert.equal(nodeHash(240, "item:i3"), "#runs/240/node/item%3Ai3");
  assert.deepEqual(parseRunsHash("#runs/240/node/item%3Ai3"), { kind: "node", id: 240, key: "item:i3" });
  assert.deepEqual(parseRunsHash("#runs/240/node/evaluate:0"), { kind: "node", id: 240, key: "evaluate:0" });
  for (const key of ["query", "answer:after", "dedupe:1:seed", "한글 키"]) assert.deepEqual(parseRunsHash(nodeHash(7, key)), { kind: "node", id: 7, key });
});

test("깨진 노드 경로는 실행 뷰나 목록으로 되돌린다", () => {
  assert.deepEqual(parseRunsHash("#runs/240/node/%E0%A4%A"), { kind: "view", id: 240 });
  assert.deepEqual(parseRunsHash("#runs/240/node/"), { kind: "list" });
  assert.deepEqual(parseRunsHash("#runs/240/node/a/b"), { kind: "list" });
  assert.deepEqual(parseRunsHash("#runs/abc/node/x"), { kind: "list" });
});
