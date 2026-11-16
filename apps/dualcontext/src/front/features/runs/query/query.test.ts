/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { addName, changeFilter, clampPage, initialQuery, pageCount, removeName } from "./index";

test("pageCount 는 항목이 없어도 1쪽이고 나머지는 올림한다", () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(20), 1);
  assert.equal(pageCount(21), 2);
  assert.equal(pageCount(95, 20), 5);
});

test("clampPage 는 범위를 벗어난 쪽을 유효한 쪽으로 맞춘다", () => {
  assert.equal(clampPage(0, 100), 1);
  assert.equal(clampPage(9, 41), 3);
  assert.equal(clampPage(2, 0), 1);
  assert.equal(clampPage(3, 100), 3);
});

test("addName 은 중복을 넣지 않고 removeName 은 해당 이름만 뺀다", () => {
  assert.deepEqual(addName(["A"], "B"), ["A", "B"]);
  assert.deepEqual(addName(["A"], "A"), ["A"]);
  assert.deepEqual(removeName(["A", "B"], "A"), ["B"]);
});

test("changeFilter 는 조건을 바꾸면서 1쪽으로 돌아간다", () => {
  const next = changeFilter({ ...initialQuery, page: 4 }, { q: "도커" });
  assert.equal(next.page, 1);
  assert.equal(next.q, "도커");
});
