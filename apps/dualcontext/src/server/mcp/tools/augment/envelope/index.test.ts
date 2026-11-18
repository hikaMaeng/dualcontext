import assert from "node:assert/strict";
import test from "node:test";
import type { AugmentResult, PlanTrace } from "dualcontext_domain/common";
import { buildError, buildReply, coverageOf } from "./index.js";

const result = (context: string, researchers: string[] = ["A", "B", "A"]): AugmentResult => ({
  context,
  routing: { researchers: [], procedures: [] },
  researcherRouting: "embedding",
  pairs: researchers.map((researcher) => ({ researcher, procedure: null, materials: [] })) as never,
  writer: { mode: "batch", calls: 1 }
});
const trace = (stop: string, evaluation: unknown = null, rounds = 1): PlanTrace =>
  ({ mode: "reevaluate", items: [], levels: [], waves: [], steps: [], stop, ms: 1, rounds: Array.from({ length: rounds }, (_, i) => ({ round: i, evaluation: i === rounds - 1 ? evaluation : null })) }) as unknown as PlanTrace;

test("light: 고정 머리 한 줄 + next 줄 + 구분선 + 컨텍스트. 출처 수는 조사원 이름 중복 제거", () => {
  const text = buildReply({ effort: "light", result: result("본문"), plan: null, elapsedMs: 41_400 });
  assert.equal(text, "[dualcontext] effort=light coverage=ok sources=2 elapsed=41s\nnext: -\n---\n본문");
});

test("컨텍스트가 비면 coverage=none 과 재시도 금지 문구, 본문은 없다", () => {
  const text = buildReply({ effort: "high", result: result("  ", []), plan: trace("no-items"), elapsedMs: 1000 });
  assert.match(text, /coverage=none/);
  assert.match(text, /next: -\n/);
  assert.match(text, /Do not retry; answer from your own knowledge\.$/);
});

test("high 가 평가를 통과하면 ok, next 는 -", () => {
  const text = buildReply({ effort: "high", result: result("본문"), plan: trace("passed", { score: 90, pass: true, reason: "r", missing: [] }, 2), elapsedMs: 5000 });
  assert.match(text, /^\[dualcontext\] effort=high coverage=ok sources=2 reflections=2 elapsed=5s\nnext: -\n---\n본문$/);
});

test("high 가 통과 못 하고 멈추면 partial + next: effort=xhigh + 부족한 컨텍스트만(점수 · 이유 · 답변은 없다)", () => {
  const evaluation = { score: 40, pass: false, reason: "평가 이유 표식", missing: [{ name: "누락 항목", description: "설명\n줄바꿈" }] };
  const withAnswer = { ...trace("max-rounds", evaluation, 2), answer: "서버 답변 표식" } as unknown as PlanTrace;
  const text = buildReply({ effort: "high", result: result("본문"), plan: withAnswer, elapsedMs: 5000 });
  assert.match(text, /coverage=partial/);
  assert.match(text, /next: effort=xhigh\nmissing: 누락 항목 - 설명 줄바꿈\n---\n본문$/);
  for (const forbidden of ["평가 이유 표식", "서버 답변 표식", "score"]) assert.equal(text.includes(forbidden), false, forbidden);
});

test("xhigh 가 partial 이어도 next 는 -(올릴 단계가 없다). middle · light 는 평가가 없어 partial 이 없다", () => {
  const stopped = trace("max-rounds", { score: 10, pass: false, reason: "", missing: [] }, 4);
  assert.match(buildReply({ effort: "xhigh", result: result("본문"), plan: stopped, elapsedMs: 0 }), /coverage=partial[^\n]*\nnext: -/);
  assert.equal(coverageOf({ effort: "middle", result: result("본문"), plan: trace("mode-decompose") }), "ok");
  assert.equal(coverageOf({ effort: "light", result: result("본문"), plan: null }), "ok");
});

test("평가 실패로 멈춘 high 도 충분함을 확인하지 못했으므로 partial", () => {
  assert.equal(coverageOf({ effort: "high", result: result("본문"), plan: trace("evaluation-failed") }), "partial");
});

test("오류 한 줄", () => {
  assert.equal(buildError("라우팅\n실패"), "error: 라우팅 실패. next: effort=light, or answer without context.");
});
