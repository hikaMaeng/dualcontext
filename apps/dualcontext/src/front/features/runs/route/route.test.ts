/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { LIST_HASH, parseRunsHash, viewHash } from "./index";

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
