/// <reference types="node" />
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { initialQuery } from "../query";
import { deleteRun, listRuns, loadFilterOptions, loadNode } from "./index";
import { buildListPath } from "./path";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** 호출된 URL · 메서드를 기록하는 가짜 fetch. */
function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; method: string | undefined }[] = [];
  globalThis.fetch = (async (url: string, init?: { method?: string }) => {
    calls.push({ url, method: init?.method });
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  }) as typeof fetch;
  return calls;
}

test("기본 조건은 page · pageSize 만 보낸다", () => {
  assert.equal(buildListPath(initialQuery), "/runs?page=1&pageSize=20");
});

test("조사원 · 프로시저는 파라미터를 반복하고 검색어가 있으면 mode 와 함께 보낸다", () => {
  const path = buildListPath({ page: 2, researchers: ["A", "B"], procedures: ["X"], q: "  도커 이미지 ", mode: "semantic" });
  const params = new URL(path, "http://x").searchParams;
  assert.match(path, /^\/runs\?page=2&pageSize=20&researcher=A&researcher=B&procedure=X&q=/);
  assert.deepEqual(params.getAll("researcher"), ["A", "B"]);
  assert.deepEqual(params.getAll("procedure"), ["X"]);
  assert.equal(params.get("q"), "도커 이미지");
  assert.equal(params.get("mode"), "semantic");
});

test("공백뿐인 검색어는 q · mode 를 보내지 않는다", () => {
  assert.equal(buildListPath({ ...initialQuery, q: "   ", mode: "semantic" }), "/runs?page=1&pageSize=20");
});

test("listRuns 는 /api/admin 아래로 GET 한다", async () => {
  const calls = fakeFetch({ items: [], total: 0, page: 1, pageSize: 20 });
  const page = await listRuns({ ...initialQuery, researchers: ["R 1"] });
  assert.equal(page.total, 0);
  assert.equal(calls[0].url, "/api/admin/runs?page=1&pageSize=20&researcher=R+1");
  assert.equal(calls[0].method, "GET");
});

test("필터 선택지와 삭제 경로", async () => {
  const calls = fakeFetch({ researchers: ["A"], procedures: [] });
  assert.deepEqual(await loadFilterOptions(), { researchers: ["A"], procedures: [] });
  assert.equal(calls[0].url, "/api/admin/runs/filters");
  const deleted = fakeFetch(null, 204);
  await deleteRun(227);
  assert.deepEqual(deleted[0], { url: "/api/admin/runs/227", method: "DELETE" });
});

test("loadNode 는 키를 인코딩해 읽고 404 는 null, 그 밖의 실패는 던진다", async () => {
  const calls = fakeFetch({ key: "item:i3", calls: [], at: "t" });
  assert.deepEqual(await loadNode(240, "item:i3"), { key: "item:i3", calls: [], at: "t" });
  assert.equal(calls[0].url, "/api/admin/runs/240/nodes/item%3Ai3");
  fakeFetch({ error: "x" }, 404);
  assert.equal(await loadNode(240, "item:zz"), null);
  fakeFetch({ error: "x" }, 500);
  await assert.rejects(loadNode(240, "analyze"), /500/);
});
