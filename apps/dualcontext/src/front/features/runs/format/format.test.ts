/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSeconds, joinNames } from "./index";

test("joinNames 는 쉼표로 합치고 비면 빈 문자열이다", () => {
  assert.equal(joinNames(["A", "B 조사원"]), "A, B 조사원");
  assert.equal(joinNames([]), "");
});

test("formatSeconds 는 소수 한 자리 초다", () => {
  assert.equal(formatSeconds(3250), "3.3");
  assert.equal(formatSeconds(0), "0.0");
});
