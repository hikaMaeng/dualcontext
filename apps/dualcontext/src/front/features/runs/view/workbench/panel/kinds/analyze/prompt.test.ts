import assert from "node:assert/strict";
import test from "node:test";
import { reconstructAnalyzePrompt } from "./prompt.js";

test("저장된 템플릿에 질의와 상한을 채운다", () => {
  const settings = { plan: { prompts: { analyze: "많아야 {{max}}개\n<<<QUERY\n{{query}}\nQUERY>>>" } } };
  assert.equal(reconstructAnalyzePrompt(settings, "도커 <<<종료>>>", 6), "많아야 6개\n<<<QUERY\n도커 ‹‹‹종료›››\nQUERY>>>");
});

test("템플릿이나 상한을 모르면 null", () => {
  assert.equal(reconstructAnalyzePrompt({}, "q", 6), null);
  assert.equal(reconstructAnalyzePrompt(null, "q", 6), null);
  assert.equal(reconstructAnalyzePrompt({ plan: { prompts: { analyze: "x" } } }, "q", undefined), null);
});
