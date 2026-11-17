/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { wrapName } from "./index";

test("짧은 이름은 한 줄이다", () => {
  assert.deepEqual(wrapName("도커 로그", 14, 2), ["도커 로그"]);
});

test("긴 한글 이름은 두 줄로 나뉘고 넘치면 말줄임표로 끝난다", () => {
  const lines = wrapName("임차권등기명령 단계별 신청 절차와 필요 서류 및 비용 안내 전체", 12, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
  assert.ok(lines.every((line) => [...line].length <= 13));
});

test("공백이 있으면 단어 경계에서 줄을 바꾼다", () => {
  assert.deepEqual(wrapName("docker container exit codes", 10, 2), ["docker container", "exit codes"]);
});

test("딱 맞는 이름은 말줄임표가 없다", () => {
  assert.deepEqual(wrapName("가나다라마바사아자차카타파하", 7, 2), ["가나다라마바사", "아자차카타파하"]);
});

test("빈 이름 · 0줄은 빈 배열이다", () => {
  assert.deepEqual(wrapName("   ", 10, 2), []);
  assert.deepEqual(wrapName("abc", 10, 0), []);
});
