import assert from "node:assert/strict";
import test from "node:test";
import type { Pair, Procedure, Researcher } from "../../common/index.js";
import { routeProceduresByKeyword, routeResearchersByKeyword } from "../route/index.js";
import { writeContext } from "../write/index.js";
import { augmentQuery, type AugmentPorts } from "./index.js";

const researcher = (id: number, name: string, keywords: string[], procedureIds: number[]): Researcher => ({
  id, name, description: "", keywords, enabled: true, type: "folder", config: {}, procedureIds
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
  assert.match(result.context, /사내문서: 수집 실패 - 폴더 없음/);
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
