/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { looksLikeMarkdown } from "./markdown";

test("제목 · 목록 · 코드 울타리 · 표 · 인용은 마크다운이다", () => {
  assert.equal(looksLikeMarkdown("# 컨텍스트\n본문"), true);
  assert.equal(looksLikeMarkdown("앞글\n- 항목 하나\n- 항목 둘"), true);
  assert.equal(looksLikeMarkdown("1. 첫째\n2. 둘째"), true);
  assert.equal(looksLikeMarkdown("```ts\nconst a = 1;\n```"), true);
  assert.equal(looksLikeMarkdown("| a | b |\n|---|---|\n| 1 | 2 |"), true);
  assert.equal(looksLikeMarkdown("> 인용"), true);
});

test("굵게 · 링크 · 인라인 코드 표기도 마크다운이다", () => {
  assert.equal(looksLikeMarkdown("이것은 **중요** 합니다"), true);
  assert.equal(looksLikeMarkdown("참고 [문서](https://example.com)"), true);
  assert.equal(looksLikeMarkdown("`npm run deploy` 를 쓴다"), true);
});

test("평문은 마크다운이 아니다", () => {
  assert.equal(looksLikeMarkdown("조사원 결과를 정리한 평문입니다.\n두 번째 줄입니다."), false);
  assert.equal(looksLikeMarkdown("가격은 3 - 5 원 사이이고 a*b 는 곱이다"), false);
  assert.equal(looksLikeMarkdown(""), false);
});
