import assert from "node:assert/strict";
import test from "node:test";
import type { Pair, Procedure, Researcher } from "../../common/index.js";
import { mergeContexts, sourceLabel, webLast, writeContext } from "./index.js";

const researcher = (id: number, name: string): Researcher => ({ id, name, description: "", keywords: [], enabled: true, type: "folder", config: {}, procedureIds: [] });
const procedure = (id: number, name: string): Procedure => ({ id, name, appliesWhen: [], steps: ["첫째 본다", "둘째 비교한다"], impacts: ["영향"], outputFormat: "표", enabled: true });

const docs = researcher(1, "사내문서");
const web = researcher(2, "웹");
const materials = [{ title: "문서 A", text: "본문 A", score: 0.7812 }, { title: "문서 B", text: "본문 B" }];

test("같은 조사원의 자료는 프로시저가 여럿이어도 한 번만 싣고 출처 번호를 붙인다", () => {
  const pairs: Pair[] = [
    { researcher: docs, procedure: procedure(1, "기본"), materials },
    { researcher: docs, procedure: procedure(2, "긴급"), materials }
  ];
  const context = writeContext("환불", pairs);
  assert.equal(context.split("본문 A").length - 1, 1);
  assert.match(context, /\[R1-1\] 문서 A \(질의와의 유사도 0\.78\)/);
  assert.match(context, /\[R1-2\] 문서 B\n/);
  // 점수가 없는 자료(웹 검색)에는 유사도를 쓰지 않는다.
  assert.doesNotMatch(context, /문서 B \(질의와의 유사도/);
  assert.match(context, /- 기본 — 볼 순서: 첫째 본다 → 둘째 비교한다/);
  assert.match(context, /- 긴급 — /);
  assert.equal(sourceLabel(docs, 0), "R1-1");
});

test("컨텍스트는 명령이 아니라 참고 자료로 쓰이고, 쓰지 않아도 된다고 밝힌다", () => {
  const context = writeContext("환불", [{ researcher: docs, procedure: procedure(1, "기본"), materials }]);
  assert.match(context, /참고용이다\. 질문과 관련 없는 자료는 쓰지 않아도 된다/);
  assert.match(context, /질문에 맞지 않으면 쓰지 않는다/);
  // 예전 문구: 분석 절차를 지시처럼 적고 「출력 형식」을 강제했다.
  assert.doesNotMatch(context, /분석 절차:|출력 형식:/);
});

test("부족한 항목은 실제로 있을 때만 쓴다: 거짓 「없음」을 적지 않는다", () => {
  const full = writeContext("환불", [{ researcher: docs, procedure: null, materials }]);
  assert.doesNotMatch(full, /찾지 못한 것|부족한 항목/);
  const partial = writeContext("환불", [
    { researcher: docs, procedure: null, materials },
    { researcher: web, procedure: null, materials: [] },
    { researcher: researcher(3, "문서고"), procedure: null, materials: [], error: "폴더 없음" }
  ]);
  assert.match(partial, /## 찾지 못한 것/);
  assert.match(partial, /- 웹: 질의와 관련된 자료를 찾지 못했다\./);
  assert.match(partial, /- 문서고: 수집에 실패했다 - 폴더 없음/);
  // 자료가 없는 조사원의 분석 관점은 싣지 않는다.
  assert.doesNotMatch(partial, /## 조사원: 웹/);
});

test("쌍별로 만든 조각을 이어 붙인다", () => {
  assert.equal(mergeContexts("질", ["가", "나"]), "# 참고 자료\n\n질의: 질\n\n가\n\n---\n\n나\n\n---");
});

const search = (id: number, name: string): Researcher => ({ ...researcher(id, name), type: "duckduckgo" });

test("웹 검색 자료는 큐레이션 조사원 뒤의 별도 섹션에 놓이고, 읽는 법이 붙는다", () => {
  const pairs: Pair[] = [
    { researcher: search(7, "덕덕고"), procedure: null, materials: [{ title: "웹 기사", text: "웹 본문" }] },
    { researcher: docs, procedure: null, materials }
  ];
  const context = writeContext("환불", pairs);
  const curated = context.indexOf("## 조사원: 사내문서");
  const section = context.indexOf("## 웹 검색 결과(검증되지 않은 보조 자료)");
  assert.ok(curated > 0 && section > curated, "큐레이션 자료가 먼저, 웹 섹션이 뒤");
  assert.match(context, /웹 섹션|공개 웹 검색에서 가져온 조각이다/);
  assert.match(context, /조사원 자료와 어긋나면 조사원 자료를 우선하고/);
  assert.match(context, /### 조사원: 덕덕고/);
  assert.match(context, /\[R7-1\] 웹 기사\n웹 본문/);
});

test("웹 검색 쌍이 없으면 웹 섹션을 만들지 않고, 자료가 없는 웹 조사원은 「찾지 못한 것」에만 적는다", () => {
  assert.doesNotMatch(writeContext("환불", [{ researcher: docs, procedure: null, materials }]), /웹 검색 결과\(/);
  const empty = writeContext("환불", [{ researcher: docs, procedure: null, materials }, { researcher: search(7, "덕덕고"), procedure: null, materials: [] }]);
  assert.doesNotMatch(empty, /웹 검색 결과\(/);
  assert.match(empty, /- 덕덕고: 질의와 관련된 자료를 찾지 못했다\./);
});

test("webLast 는 큐레이션 쌍을 앞에 두고 각 쪽의 순서를 유지한다", () => {
  const a: Pair = { researcher: search(7, "웹1"), procedure: null, materials };
  const b: Pair = { researcher: docs, procedure: null, materials };
  const c: Pair = { researcher: search(8, "웹2"), procedure: null, materials };
  const d: Pair = { researcher: researcher(3, "문서고"), procedure: null, materials };
  assert.deepEqual(webLast([a, b, c, d]).map((pair) => pair.researcher.name), ["사내문서", "문서고", "웹1", "웹2"]);
});
