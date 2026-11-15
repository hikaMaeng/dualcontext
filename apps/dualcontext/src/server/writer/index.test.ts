import assert from "node:assert/strict";
import test from "node:test";
import type { Pair, Researcher } from "dualcontext_domain/common";
import { createWriter, describePairs } from "./index.js";
import type { ModelClient } from "../model/index.js";

const researcher = (id: number, name: string, type: Researcher["type"]): Researcher => ({ id, name, description: "설명", keywords: [], enabled: true, type, config: {}, procedureIds: [] });
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
