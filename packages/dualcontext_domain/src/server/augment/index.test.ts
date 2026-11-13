import assert from "node:assert/strict";
import test from "node:test";
import type { Procedure, Researcher } from "../../common/index.js";
import { augmentQuery } from "./index.js";

const researcher = (id: number, name: string, keywords: string[]): Researcher => ({ id, name, description: "", keywords, enabled: true });
const procedure = (id: number, researcherId: number, name: string, appliesWhen: string[]): Procedure => ({
  id, researcherId, name, appliesWhen, steps: ["a"], impacts: ["b"], outputFormat: "c", enabled: true
});

const researchers = [researcher(1, "사내문서", ["환불"]), researcher(2, "웹", ["뉴스"])];
const procedures = [procedure(1, 1, "기본", []), procedure(2, 1, "긴급", ["긴급"])];

const ports = {
  listResearchers: async () => researchers,
  listProcedures: async (id: number) => procedures.filter((p) => p.researcherId === id),
  collect: async (r: Researcher) => [{ title: `${r.name} 문서`, text: "원문" }]
};

test("키워드가 맞는 연구원만 선택하고, 맞는 프로시저로 쌍을 만든다", async () => {
  const result = await augmentQuery("긴급 환불 규정", ports);
  assert.equal(result.researcherRouting, "matched");
  assert.deepEqual(result.pairs.map((p) => `${p.researcher}/${p.procedure}`), ["사내문서/긴급"]);
  assert.match(result.context, /\[출처: 사내문서 문서\]/);
});

test("맞는 키워드가 없으면 전체로 되돌아가고 프로시저 없는 연구원은 부족 항목에 적는다", async () => {
  const result = await augmentQuery("전혀 다른 질문", ports);
  assert.equal(result.researcherRouting, "fallback-all");
  assert.deepEqual(result.pairs.map((p) => `${p.researcher}/${p.procedure}`), ["사내문서/기본", "웹/null"]);
  assert.match(result.context, /웹: 적용할 프로시저가 없다/);
});

test("연구원이 없으면 부족 항목으로 알린다", async () => {
  const result = await augmentQuery("질문", { ...ports, listResearchers: async () => [] });
  assert.equal(result.researcherRouting, "none");
  assert.match(result.context, /선택된 연구원이 없다/);
});
