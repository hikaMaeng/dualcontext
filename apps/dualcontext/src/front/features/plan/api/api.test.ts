/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ContextPlanConfig } from "dualcontext_domain/common";
import { DEFAULT_MAX_PROVIDED_CHARS, validationMessage, withPlanDefaults } from "./index";

test("validationMessage 는 400 본문의 error 문장을 꺼낸다", () => {
  assert.equal(validationMessage(new Error('400 {"error":"maxLevels 는 1~6"}')), "maxLevels 는 1~6");
});

test("validationMessage 는 400 이 아니거나 해석할 수 없으면 null 이다", () => {
  assert.equal(validationMessage(new Error('500 {"error":"db"}')), null);
  assert.equal(validationMessage(new Error("400 <html>")), null);
  assert.equal(validationMessage(new Error('400 {"message":"x"}')), null);
  assert.equal(validationMessage(new Error('400 {"error":""}')), null);
  assert.equal(validationMessage("400 문자열"), null);
});

test("withPlanDefaults 는 옛 설정에 없는 maxProvidedChars 를 기본 설정 값(없으면 3000)으로 채우고 있는 값은 그대로 둔다", () => {
  const old = { mode: "decompose" } as unknown as ContextPlanConfig;
  assert.equal(withPlanDefaults(old, { config: { maxProvidedChars: 4000 } as ContextPlanConfig }).maxProvidedChars, 4000);
  assert.equal(withPlanDefaults(old, null).maxProvidedChars, DEFAULT_MAX_PROVIDED_CHARS);
  const current = { mode: "decompose", maxProvidedChars: 800 } as unknown as ContextPlanConfig;
  assert.equal(withPlanDefaults(current, { config: { maxProvidedChars: 4000 } as ContextPlanConfig }), current);
});
