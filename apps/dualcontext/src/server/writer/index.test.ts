import assert from "node:assert/strict";
import test from "node:test";
import type { Pair, Researcher } from "dualcontext_domain/common";
import { createWriter, describePairs, fillWriterPrompt } from "./index.js";
import type { ModelClient } from "../model/index.js";

const researcher = (id: number, name: string, type: Researcher["type"]): Researcher => ({ id, name, description: "설명", keywords: [], enabled: true, type, config: {}, procedureIds: [], defaultProcedureId: null });
const pair = (r: Researcher): Pair => ({ researcher: r, procedure: null, materials: [{ title: "제목", text: "본문" }] });

test("LLM 라이터 입력에서 웹 검색 쌍은 머리에 성격이 밝혀지고, 큐레이션 쌍에는 붙지 않는다", () => {
  const text = describePairs([pair(researcher(1, "문서", "folder")), pair(researcher(2, "덕덕고", "duckduckgo"))]);
  const [first, second] = text.split("### 쌍 2");
  assert.doesNotMatch(first, /웹 검색 결과|자료 성격/);
  assert.match(`### 쌍 2${second}`, /^### 쌍 2 \[웹 검색 결과\(검증되지 않은 보조 자료\)\]/);
  assert.match(second, /자료 성격: 공개 웹 검색에서 가져온 조각이다/);
});

test("템플릿 라이터는 도메인의 별도 섹션 조립을 그대로 쓴다", async () => {
  const writer = createWriter({ chat: async () => "" } as unknown as ModelClient, null);
  const context = await writer.write("질", [pair(researcher(1, "문서", "folder")), pair(researcher(2, "덕덕고", "duckduckgo"))]);
  assert.match(context, /## 웹 검색 결과\(검증되지 않은 보조 자료\)/);
});

const provided = [{ name: "환불 규정", context: "규정 본문" }];
const fillOld = (template: string, values: Record<string, string>) => template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => values[key] ?? "");

test("LLM 라이터: 사전 컨텍스트가 없으면 프롬프트는 이전과 같다({{provided}} 는 빈 문자열)", () => {
  const pairs = [pair(researcher(1, "문서", "folder"))];
  const template = "질의: {{query}}\n{{pairs}}";
  const old = fillOld(template, { query: "질", pairs: describePairs(pairs) });
  assert.equal(fillWriterPrompt(template, "질", pairs), old);
  assert.equal(fillWriterPrompt(template, "질", pairs, []), old);
  assert.equal(fillWriterPrompt("A{{provided}}B {{query}}", "질", pairs), "AB 질");
});

test("LLM 라이터: 사전 컨텍스트는 {{provided}} 자리에, 없으면 첫 {{query}} 뒤에, {{query}} 도 없으면 끝에 붙는다", () => {
  const pairs = [pair(researcher(1, "문서", "folder"))];
  const explicit = fillWriterPrompt("[{{provided}}] 질의: {{query}}", "질", pairs, provided);
  assert.match(explicit, /^\[## 사전 제공된 컨텍스트[\s\S]*### 환불 규정\n\n규정 본문\] 질의: 질$/);
  const afterQuery = fillWriterPrompt("질의: {{query}}\n쌍:\n{{pairs}}\n다시 {{query}}", "질", pairs, provided);
  assert.ok(afterQuery.indexOf("사전 제공된 컨텍스트") > afterQuery.indexOf("질의: 질"));
  assert.ok(afterQuery.indexOf("사전 제공된 컨텍스트") < afterQuery.indexOf("쌍:"));
  assert.equal(afterQuery.split("사전 제공된 컨텍스트").length - 1, 1);
  assert.match(fillWriterPrompt("{{pairs}}", "질", pairs, provided), /### 환불 규정\n\n규정 본문$/);
});

test("라이터는 사전 컨텍스트를 반영한다: 템플릿은 섹션, LLM 은 프롬프트, LLM 실패 시 대체 조립에도 남는다", async () => {
  const pairs = [pair(researcher(1, "문서", "folder"))];
  const template = createWriter({ chat: async () => "" } as unknown as ModelClient, null);
  assert.match(await template.write("질", pairs, provided), /## 사전 제공된 컨텍스트/);
  let seen = "";
  const llm = createWriter({ chat: async (prompt: string) => { seen = prompt; return "ok"; } } as unknown as ModelClient, { id: 1, name: "w", engine: "llm", mode: "batch", prompt: "{{query}}", active: true });
  await llm.write("질", pairs, provided);
  assert.match(seen, /규정 본문/);
  const failing = createWriter({ chat: async () => { throw new Error("down"); } } as unknown as ModelClient, { id: 1, name: "w", engine: "llm", mode: "batch", prompt: "{{query}}", active: true });
  assert.match(await failing.write("질", pairs, provided), /라이터 LLM 호출 실패[\s\S]*사전 제공된 컨텍스트/);
});
