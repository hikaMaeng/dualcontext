/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Researcher } from "dualcontext_domain/common";
import { changeFilter, clampPage, filterResearchers, initialQuery, isFiltering, pageCount, pageOf } from "./index";

const r = (id: number, over: Partial<Researcher> = {}): Researcher => ({
  id, name: `조사원${id}`, description: "", keywords: [], enabled: true, type: "pgvector", config: {}, procedureIds: [], defaultProcedureId: null, router: null, ...over
});
const ids = (items: Researcher[]) => items.map((item) => item.id);

const set = [
  r(1, { name: "법률 용어 사전", description: "법률 용어 정의", keywords: ["법률", "용어"], config: { table: "kb_law" }, procedureIds: [10, 11], defaultProcedureId: 10 }),
  r(2, { name: "웹 검색", type: "duckduckgo", procedureIds: [11] }),
  r(3, { name: "코드: dualcontext", type: "codebase", enabled: false, config: { source: "directory", path: "workspace/dualcontext" }, router: { steps: [] } }),
  r(4, { name: "AI 논문", config: { table: "kb_ai" } })
];

test("조건이 없으면 전부, 정렬은 등록순(id)이다", () => {
  assert.deepEqual(ids(filterResearchers(set, initialQuery)), [1, 2, 3, 4]);
  assert.equal(isFiltering(initialQuery), false);
});

test("검색어는 낱말마다 AND 이고 이름 · 설명 · 키워드 · 출처를 대소문자 없이 본다", () => {
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, q: "법률 정의" })), [1]);
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, q: "KB_AI" })), [4]);
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, q: "workspace/dual" })), [3]);
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, q: "  " })), [1, 2, 3, 4]);
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, q: "법률 없는말" })), []);
});

test("유형 · 사용 여부 · 프로시저 · 기본 프로시저 · 개별 라우터 조건", () => {
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, type: "duckduckgo" })), [2]);
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, enabled: "off" })), [3]);
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, enabled: "on" })), [1, 2, 4]);
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, procedure: "11" })), [1, 2]);
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, procedure: "none" })), [3, 4]);
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, defaultProcedure: "has" })), [1]);
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, defaultProcedure: "none" })), [2, 3, 4]);
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, router: "own" })), [3]);
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, router: "global" })), [1, 2, 4]);
});

test("조건은 서로 AND 이고, 이름순 정렬은 입력을 바꾸지 않는다", () => {
  assert.deepEqual(ids(filterResearchers(set, { ...initialQuery, enabled: "on", procedure: "11", q: "검색" })), [2]);
  const copy = [...set];
  const byName = filterResearchers(set, { ...initialQuery, sort: "name" });
  assert.deepEqual(set, copy);
  assert.deepEqual(byName.map((item) => item.name), [...set.map((item) => item.name)].sort((a, b) => a.localeCompare(b)));
});

test("조건을 바꾸면 1쪽으로 돌아가고 isFiltering 은 정렬을 조건으로 치지 않는다", () => {
  assert.equal(changeFilter({ ...initialQuery, page: 4 }, { q: "도커" }).page, 1);
  assert.equal(isFiltering({ ...initialQuery, sort: "name" }), false);
  assert.equal(isFiltering({ ...initialQuery, router: "own" }), true);
});

test("쪽 나누기: 쪽 수 · 범위 보정 · 쪽 항목", () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(21), 2);
  assert.equal(clampPage(9, 41), 3);
  assert.equal(clampPage(0, 41), 1);
  const items = Array.from({ length: 45 }, (_, i) => i + 1);
  assert.deepEqual(pageOf(items, 1).length, 20);
  assert.deepEqual(pageOf(items, 3), [41, 42, 43, 44, 45]);
  assert.deepEqual(pageOf(items, 99), [41, 42, 43, 44, 45], "범위 밖 쪽은 마지막 쪽");
  assert.deepEqual(pageOf([], 1), []);
});
