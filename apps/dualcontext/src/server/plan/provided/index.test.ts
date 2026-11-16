import assert from "node:assert/strict";
import test from "node:test";
import type { Pair, Researcher } from "dualcontext_domain/common";
import { writeContext } from "dualcontext_domain/server";
import { clipProvided, prepareProvided, stripProvidedSections } from "./index.js";

const researcher = (id: number, name: string): Researcher => ({ id, name, description: "", keywords: [], enabled: true, type: "folder", config: {}, procedureIds: [], defaultProcedureId: null });
const pair = (id: number, name: string, text: string): Pair => ({ researcher: researcher(id, name), procedure: null, materials: [{ title: `${name} 문서`, text }] });

test("중첩 제거: 템플릿 라이터 컨텍스트에서 「사전 제공된 컨텍스트」 섹션만 빠지고 아이템 자체 자료는 남는다", () => {
  // 3단계 사슬: i3(맨 아래) → i2(i3 를 받음) → i1(i2 를 받음). 제거하지 않으면 i1 안에 i3 자료가 i2 섹션을 거쳐 한 번 더 들어간다.
  const i3 = writeContext("i3", [pair(3, "법령", "법령 본문")]);
  const i2 = writeContext("i2", [pair(2, "절차", "절차 본문")], [{ name: "i3", context: i3 }]);
  assert.match(i2, /## 사전 제공된 컨텍스트/);
  const stripped = stripProvidedSections(i2);
  assert.doesNotMatch(stripped, /사전 제공된 컨텍스트|법령 본문/);
  assert.match(stripped, /## 조사원: 절차[\s\S]*절차 본문/);
  assert.match(stripped, /^# 참고 자료/);

  const nested = writeContext("i1", [pair(1, "상위", "상위 본문")], [{ name: "i2", context: i2 }]);
  const flat = writeContext("i1", [pair(1, "상위", "상위 본문")], prepareProvided([{ name: "i2", context: i2 }], 20000));
  assert.equal(nested.split("법령 본문").length - 1, 1);
  assert.equal(flat.split("법령 본문").length - 1, 0);
  assert.equal(flat.split("사전 제공된 컨텍스트").length - 1, 1);
  assert.ok(flat.length < nested.length);
});

test("중첩 제거: 섹션이 끝에 있거나 여러 개여도, 머리글이 없는 글은 그대로", () => {
  assert.equal(stripProvidedSections("# A\n본문\n\n## 사전 제공된 컨텍스트\n\n안내\n\n### x\n\n#### 깊은 것\n내용"), "# A\n본문");
  assert.equal(stripProvidedSections("앞\n### 사전 제공된 컨텍스트\n빼기\n### 다음\n남김\n## 사전 제공된 컨텍스트\n빼기2"), "앞\n### 다음\n남김");
  assert.equal(stripProvidedSections("LLM 이 쓴 자유 서술. 사전 제공된 컨텍스트 라는 말이 문장에 있어도"), "LLM 이 쓴 자유 서술. 사전 제공된 컨텍스트 라는 말이 문장에 있어도");
});

test("길이 상한: 넘으면 앞부분만 남기고 「(이하 N자 생략)」, N 은 버린 글자 수", () => {
  const text = "가".repeat(1200);
  const clipped = clipProvided(text, 500);
  assert.equal(clipped, `${"가".repeat(500)}\n…(이하 700자 생략)`);
  assert.equal(clipProvided("짧다", 500), "짧다");
  assert.equal(clipProvided("가".repeat(500), 500), "가".repeat(500));
});

test("prepareProvided: 제거 후 비게 된 사전 컨텍스트는 빼고, 이름은 유지한다", () => {
  const onlySection = "## 사전 제공된 컨텍스트\n\n안내\n\n### x\n\n내용";
  assert.deepEqual(prepareProvided([{ name: "빈", context: onlySection }, { name: "긴", context: "나".repeat(800) }], 600), [{ name: "긴", context: `${"나".repeat(600)}\n…(이하 200자 생략)` }]);
});
