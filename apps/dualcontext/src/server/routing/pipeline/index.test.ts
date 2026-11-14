import assert from "node:assert/strict";
import test from "node:test";
import type { RouterStep } from "dualcontext_domain/common";
import { runPipeline } from "./index.js";

type Item = { id: number; name: string };
const items: Item[] = [{ id: 1, name: "법률" }, { id: 2, name: "의학" }, { id: 3, name: "요리" }, { id: 4, name: "여행" }];
// 질의 벡터는 [1, 0]. 후보 벡터의 첫 성분이 곧 코사인에 가깝다(길이 1).
const vectors: Record<number, number[]> = { 1: [0.9, 0.436], 2: [0.8, 0.6], 3: [0.7, 0.714], 4: [0.3, 0.954] };

function env(overrides: { chat?: (prompt: string) => Promise<string>; embedQuery?: () => Promise<number[]> } = {}) {
  const prompts: string[] = [];
  return {
    prompts,
    env: {
      query: "질의",
      embedQuery: overrides.embedQuery ?? (async () => [1, 0]),
      vectorsOf: async (list: Item[]) => list.map((item) => vectors[item.id]),
      chat: async (prompt: string) => {
        prompts.push(prompt);
        return overrides.chat ? overrides.chat(prompt) : "[2]";
      },
      line: (item: Item, score?: number) => `id=${item.id} | ${item.name}${score === undefined ? "" : ` | ${score.toFixed(2)}`}`,
      keywordTopK: (list: Item[], topK: number) => list.filter((item) => item.name === "요리").slice(0, topK)
    }
  };
}

const embedding = (extra: Partial<Extract<RouterStep, { type: "embedding" }>> = {}): RouterStep => ({ type: "embedding", topK: 3, minScore: 0.6, margin: 1, parts: true, onError: "skip", ...extra });
const llm = (extra: Partial<Extract<RouterStep, { type: "llm" }>> = {}): RouterStep => ({ type: "llm", topK: 2, prompt: "{{query}}|{{topK}}\n{{candidates}}", showScores: false, allowNone: true, parts: false, onError: "skip", ...extra });

test("임베딩 한 단계는 점수 규칙으로 고르고 모든 후보의 점수와 단계 기록을 돌려준다", async () => {
  const result = await runPipeline({ steps: [embedding({ topK: 2 })] }, items, env().env);
  assert.deepEqual(result.selected.map((item) => item.id), [1, 2]);
  assert.equal(result.mode, "embedding");
  assert.deepEqual(result.scores?.map((entry) => [entry.id, entry.selected]), [[1, true], [2, true], [3, false], [4, false]]);
  assert.deepEqual(result.steps?.map((step) => [step.type, step.input, step.output]), [["embedding", 4, 2]]);
});

test("단계는 앞 단계가 남긴 후보만 받는다: 임베딩 다음 LLM 은 좁혀진 목록만 본다", async () => {
  const run = env({ chat: async () => "[2]" });
  const result = await runPipeline({ steps: [embedding({ topK: 3 }), llm({ showScores: true })] }, items, run.env);
  assert.deepEqual(result.selected.map((item) => item.id), [2]);
  assert.equal(result.mode, "embedding>llm");
  assert.match(run.prompts[0], /id=1 \| 법률 \| 0\.90/);
  assert.doesNotMatch(run.prompts[0], /여행/);
  // 점수표는 첫 임베딩 단계가 입력 전체에 매긴 것이고, 선택 표시는 최종 결과를 따른다.
  assert.deepEqual(result.scores?.filter((entry) => entry.selected).map((entry) => entry.id), [2]);
});

test("LLM 이 「없음」을 답하면 allowNone 일 때만 비운다", async () => {
  const none = await runPipeline({ steps: [embedding(), llm({ allowNone: true })] }, items, env({ chat: async () => "[]" }).env);
  assert.deepEqual(none.selected, []);
  const ignored = await runPipeline({ steps: [embedding({ topK: 2 }), llm({ allowNone: false })] }, items, env({ chat: async () => "[]" }).env);
  assert.deepEqual(ignored.selected.map((item) => item.id), [1, 2]);
  assert.equal(ignored.steps?.[1].note, "empty-answer-ignored");
});

test("단계가 후보를 비우면 남은 단계는 돌지 않는다", async () => {
  const run = env();
  const result = await runPipeline({ steps: [embedding({ minScore: 0.95 }), llm()] }, items, run.env);
  assert.deepEqual(result.selected, []);
  assert.equal(run.prompts.length, 0);
  assert.equal(result.steps?.length, 1);
});

test("단계 실패는 onError 대로 처리하고 사실을 기록에 남긴다", async () => {
  const failing = env({ chat: async () => { throw new Error("서버 꺼짐"); } });
  const skipped = await runPipeline({ steps: [embedding({ topK: 2 }), llm({ onError: "skip" })] }, items, failing.env);
  assert.deepEqual(skipped.selected.map((item) => item.id), [1, 2]);
  assert.match(skipped.mode, /^embedding>llm-failed\(서버 꺼짐\)->skip$/);
  const keyword = await runPipeline({ steps: [llm({ onError: "keyword" })] }, items, failing.env);
  assert.deepEqual(keyword.selected.map((item) => item.name), ["요리"]);
  const none = await runPipeline({ steps: [llm({ onError: "none" })] }, items, failing.env);
  assert.deepEqual(none.selected, []);
  // 배열이 없는 답은 해석 실패다.
  const garbled = await runPipeline({ steps: [llm({ onError: "none" })] }, items, env({ chat: async () => "모르겠습니다" }).env);
  assert.match(garbled.steps?.[0].note ?? "", /no id array/);
});

test("하위 질문은 parts 가 켜진 단계만 거치고 결과를 topK 개로 자른다", async () => {
  const run = env();
  const result = await runPipeline({ steps: [embedding({ topK: 3 }), llm({ parts: false })] }, items, run.env, { part: { topK: 1 } });
  assert.deepEqual(result.selected.map((item) => item.id), [1]);
  assert.equal(run.prompts.length, 0);
  assert.equal(result.mode, "embedding");
  const none = await runPipeline({ steps: [llm({ parts: false })] }, items, run.env, { part: { topK: 1 } });
  assert.equal(none.mode, "none(no-step)");
});

test("후보가 없으면 아무 단계도 돌지 않는다", async () => {
  assert.deepEqual(await runPipeline({ steps: [embedding()] }, [], env().env), { mode: "none", selected: [] });
});

test("질의 임베딩 계산 실패는 단계 실패로 다뤄진다", async () => {
  const result = await runPipeline({ steps: [embedding({ onError: "keyword" })] }, items, env({ embedQuery: async () => { throw new Error("임베딩 서버 오류"); } }).env);
  assert.deepEqual(result.selected.map((item) => item.name), ["요리"]);
  assert.match(result.mode, /^embedding-failed\(임베딩 서버 오류\)->keyword$/);
});
