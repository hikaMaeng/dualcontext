import assert from "node:assert/strict";
import test from "node:test";
import type { Pair, Procedure, Researcher } from "../../common/index.js";
import { routeProceduresByKeyword, routeResearchersByKeyword } from "../route/index.js";
import { mergeContexts, writeContext } from "../write/index.js";
import type { Provided } from "../plan/ports.js";
import { augmentQuery, type AugmentPorts } from "./index.js";

const researcher = (id: number, name: string, keywords: string[], procedureIds: number[], defaultProcedureId: number | null = null): Researcher => ({
  id, name, description: "", keywords, enabled: true, type: "folder", config: {}, procedureIds, defaultProcedureId
});
const procedure = (id: number, name: string, appliesWhen: string[]): Procedure => ({
  id, name, appliesWhen, steps: ["a"], impacts: ["b"], outputFormat: "c", enabled: true
});

const researchers = [researcher(1, "사내문서", ["환불"], [1, 2]), researcher(2, "웹", ["뉴스"], [])];
const procedures = [procedure(1, "기본", []), procedure(2, "긴급", ["긴급"])];

function ports(mode: "batch" | "per_pair", overrides: Partial<AugmentPorts> = {}): AugmentPorts {
  return {
    listResearchers: async () => researchers,
    listProceduresOf: async (r) => procedures.filter((p) => r.procedureIds.includes(p.id)),
    selectResearchers: async (query, candidates) => routeResearchersByKeyword(query, candidates, 5),
    selectProcedures: async (query, _r, candidates) => routeProceduresByKeyword(query, candidates, 5),
    collect: async (r) => [{ title: `${r.name} 문서`, text: "원문" }],
    writer: { mode, write: (query: string, pairs: Pair[]) => writeContext(query, pairs) },
    ...overrides
  };
}

test("키워드가 맞는 조사원만 선택하고, 맞는 프로시저로 쌍을 만든다", async () => {
  const result = await augmentQuery("긴급 환불 규정", ports("batch"));
  assert.equal(result.researcherRouting, "keyword");
  assert.deepEqual(result.pairs.map((p) => `${p.researcher}/${p.procedure}`), ["사내문서/긴급"]);
  assert.deepEqual(result.writer, { mode: "batch", calls: 1 });
});

test("맞는 조사원이 없으면 아무것도 붙이지 않고 컨텍스트를 만들지 않는다", async () => {
  let writerCalled = false;
  const result = await augmentQuery(
    "전혀 다른 질문",
    ports("batch", { writer: { mode: "batch", write: () => { writerCalled = true; return "x"; } } })
  );
  assert.equal(result.researcherRouting, "keyword-none");
  assert.deepEqual(result.pairs, []);
  assert.equal(result.context, "");
  assert.equal(writerCalled, false);
  assert.deepEqual(result.writer, { mode: "batch", calls: 0 });
});

test("프로시저 상위 개수 제한이 쌍 수를 정한다", async () => {
  const result = await augmentQuery(
    "긴급 환불",
    ports("batch", { selectProcedures: async (_q, _r, candidates) => ({ mode: "fixed", selected: candidates }) })
  );
  assert.equal(result.pairs.length, 2);
});

test("per_pair 라이터는 쌍 수만큼 호출되고 결과가 이어 붙는다", async () => {
  const seen: number[] = [];
  const result = await augmentQuery(
    "환불",
    ports("per_pair", {
      selectProcedures: async (_q, _r, candidates) => ({ mode: "fixed", selected: candidates }),
      writer: { mode: "per_pair", write: (_q, pairs) => { seen.push(pairs.length); return `조각 ${pairs[0].procedure?.name}`; } }
    })
  );
  assert.deepEqual(seen, [1, 1]);
  assert.equal(result.writer.calls, 2);
  assert.match(result.context, /조각 기본\n\n---\n\n조각 긴급/);
});

test("수집 실패는 숨기지 않고 컨텍스트에 이유와 함께 남는다", async () => {
  const result = await augmentQuery("환불", ports("batch", { collect: async () => { throw new Error("폴더 없음"); } }));
  assert.match(result.context, /사내문서: 수집에 실패했다 - 폴더 없음/);
});

test("조사원은 골랐지만 어느 출처에서도 자료가 나오지 않으면(오류 없이) 컨텍스트를 만들지 않는다", async () => {
  const result = await augmentQuery("환불", ports("batch", { collect: async () => [] }));
  assert.equal(result.pairs.length, 1);
  assert.equal(result.context, "");
});

test("라우팅 점수표가 결과에 실린다(이름 · 점수 · 선택 여부)", async () => {
  const result = await augmentQuery(
    "환불",
    ports("batch", {
      selectResearchers: async (_q, candidates) => ({
        mode: "embedding",
        selected: [candidates[0]],
        scores: [{ id: 1, score: 0.7123456, selected: true }, { id: 2, score: 0.55, selected: false }]
      })
    })
  );
  assert.deepEqual(result.routing.researchers, [
    { name: "사내문서", score: 0.7123, selected: true },
    { name: "웹", score: 0.55, selected: false }
  ]);
  assert.equal(result.routing.procedures[0].researcher, "사내문서");
});

test("조사원이 없으면 컨텍스트가 비고 점수표는 비어 있다", async () => {
  const result = await augmentQuery("질문", ports("batch", { listResearchers: async () => [] }));
  assert.equal(result.researcherRouting, "none");
  assert.equal(result.context, "");
  assert.deepEqual(result.routing.researchers, []);
});

test("자료가 하나도 없는 조사원에는 프로시저 라우팅을 하지 않는다(관련 없는 절차가 실리는 것을 막는다)", async () => {
  let procedureRouted = 0;
  const result = await augmentQuery(
    "환불",
    ports("batch", {
      collect: async (r) => (r.id === 1 ? [] : [{ title: "문서", text: "원문" }]),
      selectResearchers: async (_q, candidates) => ({ mode: "fixed", selected: candidates }),
      selectProcedures: async (_q, _r, candidates) => { procedureRouted += 1; return { mode: "fixed", selected: candidates }; }
    })
  );
  assert.equal(procedureRouted, 1); // 자료가 있는 조사원(웹)만
  const empty = result.pairs.find((p) => p.researcher === "사내문서");
  assert.equal(empty?.procedure, null);
  assert.equal(empty?.procedureRouting, "skipped(no-material)");
  assert.match(result.context, /사내문서: 질의와 관련된 자료를 찾지 못했다/);
});

test("복합 질의는 하위 질문으로도 라우팅해 합집합을 고르고, 하위 질문이 고른 조사원은 그 하위 질문으로 수집한다", async () => {
  const first = "사내 환불 규정은 어떻게 되는지, ";
  const second = "최신 뉴스 동향은 어떤지 알려줘";
  const asked: string[] = [];
  const result = await augmentQuery(
    `${first}${second}`,
    ports("batch", {
      // 통째 질의로는 아무도 고르지 못하고, 하위 질문마다 맞는 조사원 하나씩 고른다.
      selectResearchers: async (query, candidates) => ({ mode: "embedding", selected: query.includes("환불") && !query.includes("뉴스") ? [candidates[0]] : query.includes("뉴스") && !query.includes("환불") ? [candidates[1]] : [] }),
      collect: async (researcher, query) => { asked.push(`${researcher.name}:${query}`); return [{ title: researcher.name, text: "원문" }]; }
    })
  );
  assert.deepEqual(result.pairs.map((pair) => pair.researcher), ["사내문서", "웹"]);
  assert.deepEqual(asked, ["사내문서:사내 환불 규정은 어떻게 되는지", "웹:최신 뉴스 동향은 어떤지 알려줘"]);
});

test("라이터에는 웹 검색 쌍이 큐레이션 쌍 뒤에 가고, 결과의 쌍 순서는 라우팅 순서를 유지한다", async () => {
  const web: Researcher = { ...researcher(2, "덕덕고", ["환불"], []), type: "duckduckgo" };
  const seen: string[][] = [];
  const result = await augmentQuery("환불 규정", ports("batch", {
    listResearchers: async () => [web, researcher(1, "사내문서", ["환불"], [])],
    writer: { mode: "batch", write: (_query: string, pairs: Pair[]) => { seen.push(pairs.map((p) => p.researcher.name)); return "x"; } }
  }));
  assert.deepEqual(seen, [["사내문서", "덕덕고"]]);
  assert.deepEqual(result.pairs.map((p) => p.researcher), ["덕덕고", "사내문서"]);
});

// --- 기본 프로시저 폴백 ---
const none: AugmentPorts["selectProcedures"] = async () => ({ mode: "llm", selected: [] });
const withDefault = (defaultId: number | null) => [researcher(1, "사내문서", ["환불"], [1, 2], defaultId), researchers[1]];

test("폴백: 프로시저 라우팅이 0개를 고르면 활성 기본 프로시저가 붙고 procedureRouting 은 default, 기록에 fallback 이 남는다", async () => {
  const result = await augmentQuery("환불", ports("batch", { listResearchers: async () => withDefault(2), selectProcedures: none }));
  assert.deepEqual(result.pairs.map((p) => `${p.researcher}/${p.procedure}/${p.procedureRouting}`), ["사내문서/긴급/default"]);
  assert.deepEqual(result.routing.procedures.map((entry) => `${entry.researcher}:${entry.fallback}`), ["사내문서:default"]);
  assert.match(result.context, /긴급/); // 라이터에 프로시저가 실제로 전달된다
});

test("폴백 아님: 라우팅이 하나라도 골랐으면 기본 프로시저를 붙이지 않는다(라우터 모드 그대로, fallback 없음)", async () => {
  const result = await augmentQuery("환불", ports("batch", {
    listResearchers: async () => withDefault(2),
    selectProcedures: async (_q, _r, candidates) => ({ mode: "llm", selected: candidates.filter((p) => p.id === 1) })
  }));
  assert.deepEqual(result.pairs.map((p) => `${p.procedure}/${p.procedureRouting}`), ["기본/llm"]);
  assert.equal(result.routing.procedures[0].fallback, undefined);
});

test("폴백 아님: 기본 프로시저가 없으면 지금처럼 프로시저 없는 쌍이 된다", async () => {
  const result = await augmentQuery("환불", ports("batch", { listResearchers: async () => withDefault(null), selectProcedures: none }));
  assert.deepEqual(result.pairs.map((p) => `${p.procedure}/${p.procedureRouting}`), ["null/llm"]);
  assert.equal(result.routing.procedures[0].fallback, undefined);
});

test("폴백 아님: 기본 프로시저가 비활성이거나 연결 목록에 없으면 붙이지 않는다", async () => {
  const disabled = await augmentQuery("환불", ports("batch", {
    listResearchers: async () => withDefault(2),
    listProceduresOf: async () => [procedure(1, "기본", []), { ...procedure(2, "긴급", ["긴급"]), enabled: false }],
    selectProcedures: none
  }));
  assert.deepEqual(disabled.pairs.map((p) => `${p.procedure}/${p.procedureRouting}`), ["null/llm"]);
  const unlinked = await augmentQuery("환불", ports("batch", { listResearchers: async () => withDefault(7), selectProcedures: none }));
  assert.deepEqual(unlinked.pairs.map((p) => `${p.procedure}/${p.procedureRouting}`), ["null/llm"]);
  assert.equal(unlinked.routing.procedures[0].fallback, undefined);
});

test("폴백 아님: 자료가 없어 skipped(no-material) 이면 기본 프로시저가 있어도 붙이지 않고 프로시저 라우팅도 하지 않는다", async () => {
  let routed = 0;
  const result = await augmentQuery("환불", ports("batch", {
    listResearchers: async () => withDefault(2),
    collect: async () => [],
    selectProcedures: async () => { routed += 1; return { mode: "llm", selected: [] }; }
  }));
  assert.equal(routed, 0);
  assert.deepEqual(result.pairs.map((p) => `${p.procedure}/${p.procedureRouting}`), ["null/skipped(no-material)"]);
  assert.deepEqual(result.routing.procedures, []);
});

test("기본 프로시저는 라우팅 후보에서 빠진다(범용 문구가 구체적 프로시저를 앞서지 않게), 폴백으로만 붙는다", async () => {
  let offered: number[] = [];
  const result = await augmentQuery("환불", ports("batch", {
    listResearchers: async () => withDefault(2),
    selectProcedures: async (_q, _r, candidates) => { offered = candidates.map((p) => p.id); return { mode: "llm", selected: [] }; }
  }));
  assert.deepEqual(offered, [1]);
  assert.deepEqual(result.pairs.map((p) => p.procedure), ["긴급"]);
});

test("사전 컨텍스트(provided)는 라이터에만 전달되고 라우팅 · 수집은 질의만으로 한다(batch)", async () => {
  const collected: string[] = [];
  const seen: unknown[][] = [];
  const result = await augmentQuery("긴급 환불", ports("batch", {
    collect: async (r, text) => { collected.push(text); return [{ title: `${r.name} 문서`, text: "원문" }]; },
    writer: { mode: "batch", write: (...args: unknown[]) => { seen.push(args); return "ctx"; } }
  }), [{ name: "환불 규정", context: "규정 본문" }]);
  assert.deepEqual(collected, ["긴급 환불"]);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0][2], [{ name: "환불 규정", context: "규정 본문" }]);
  assert.equal(result.context, "ctx");
});

test("사전 컨텍스트는 per_pair 라이터의 호출마다 전달되고, 빈 배열이면 세 번째 인자 없이 부른다(기존 호출과 같다)", async () => {
  const lengths: number[] = [];
  await augmentQuery("긴급 환불", ports("per_pair", {
    selectProcedures: async (_q, _r, candidates) => ({ mode: "fixed", selected: candidates }),
    writer: { mode: "per_pair", write: (...args: unknown[]) => { lengths.push(args.length); return "p"; } }
  }), [{ name: "선행", context: "본문" }]);
  assert.deepEqual(lengths, [3, 3]);
  lengths.length = 0;
  await augmentQuery("긴급 환불", ports("batch", { writer: { mode: "batch", write: (...args: unknown[]) => { lengths.push(args.length); return "b"; } } }), []);
  assert.deepEqual(lengths, [2]);
});

test("사전 컨텍스트가 비지 않으면 맞는 조사원이 없어도 라이터를 부른다(batch: 빈 쌍 + provided → 사전 컨텍스트 섹션만)", async () => {
  const seen: unknown[][] = [];
  const result = await augmentQuery("전혀 다른 질문", ports("batch", {
    writer: { mode: "batch", write: (query: string, pairs: Pair[], provided?: Provided[]) => { seen.push([pairs, provided]); return writeContext(query, pairs, provided); } }
  }), [{ name: "선행", context: "본문" }]);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0][0], []);
  assert.deepEqual(result.writer, { mode: "batch", calls: 1 });
  assert.match(result.context, /## 사전 제공된 컨텍스트[\s\S]*### 선행\n\n본문/);
  assert.doesNotMatch(result.context, /찾지 못한 것/);
});

test("사전 컨텍스트가 있으면 조사원은 골랐지만 자료가 0개여도 라이터를 부른다(A→B 에서 B 에만 자료가 있는 경우)", async () => {
  const batchSeen: number[] = [];
  const batch = await augmentQuery("환불", ports("batch", {
    collect: async () => [],
    writer: { mode: "batch", write: (_q: string, pairs: Pair[]) => { batchSeen.push(pairs.length); return "b"; } }
  }), [{ name: "B", context: "B 본문" }]);
  assert.deepEqual(batchSeen, [1], "batch 는 쌍 전체(자료 0개 쌍 포함)로 1회");
  assert.equal(batch.context, "b");

  const perPairSeen: unknown[][] = [];
  const perPair = await augmentQuery("환불", ports("per_pair", {
    collect: async () => [],
    writer: { mode: "per_pair", write: (...args: unknown[]) => { perPairSeen.push(args); return "p"; } }
  }), [{ name: "B", context: "B 본문" }]);
  assert.equal(perPairSeen.length, 1, "per_pair 는 쓸모 있는 쌍이 없으면 빈 쌍 배열로 1회");
  assert.deepEqual(perPairSeen[0][1], []);
  assert.deepEqual(perPairSeen[0][2], [{ name: "B", context: "B 본문" }]);
  assert.deepEqual(perPair.writer, { mode: "per_pair", calls: 1 });
  assert.equal(perPair.context, mergeContexts("환불", ["p"]));
});

test("provided 가 없거나 내용이 모두 비면 기존과 같다: 쓸모없는 쌍이면 라이터를 부르지 않는다", async () => {
  for (const provided of [undefined, [], [{ name: "빈것", context: "  " }]]) {
    let called = false;
    const result = await augmentQuery("전혀 다른 질문", ports("batch", { writer: { mode: "batch", write: () => { called = true; return "x"; } } }), provided);
    assert.equal(result.context, "");
    assert.equal(called, false);
    assert.deepEqual(result.writer, { mode: "batch", calls: 0 });
  }
});
