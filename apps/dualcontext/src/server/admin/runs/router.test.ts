import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import type pg from "pg";
import type { Deps } from "../../augment/index.js";
import { runsRouter } from "./index.js";

function app(rows: unknown[], embed: () => Promise<number[][]> = async () => [[1, 0]]) {
  const calls: { text: string; values: unknown[] }[] = [];
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      if (/count\(\*\)/.test(text)) return { rows: [{ total: 1 }] };
      if (/unnest\(researcher_names\)/.test(text)) return { rows: [{ researchers: ["문서", "코드"], procedures: ["P"] }] };
      return { rows };
    }
  } as unknown as pg.Pool;
  const model = { embed, settings: async () => ({ embedding: { baseUrl: "", model: "m", apiKey: "" }, chat: { baseUrl: "", model: "", apiKey: "" } }) };
  const server = express().use("/api/admin", runsRouter({ pool, model, dataDir: "" } as unknown as Deps));
  return { server, calls };
}

test("GET /runs: 쿼리 문자열의 반복 키가 필터로 가고 응답은 RunListPage 모양이다", async () => {
  const { server, calls } = app([{ id: 2, createdAt: "t", query: "q", status: "ok", durationMs: 1, researchers: ["A"], procedures: [], score: null }]);
  const response = await request(server).get("/api/admin/runs?page=2&pageSize=5&researcher=A&researcher=B&procedure=X").expect(200);
  assert.deepEqual(Object.keys(response.body).sort(), ["items", "page", "pageSize", "total"]);
  assert.equal(response.body.page, 2);
  assert.equal(response.body.pageSize, 5);
  assert.deepEqual(calls[0].values, [["A", "B"], ["X"], 5, 5]);
});

test("GET /runs: 잘못된 값은 400 + error", async () => {
  const { server } = app([]);
  for (const query of ["page=0", "pageSize=101", "mode=fuzzy", "pageSize=abc"]) {
    const response = await request(server).get(`/api/admin/runs?${query}`).expect(400);
    assert.equal(typeof response.body.error, "string");
  }
});

test("GET /runs?mode=semantic: 임베딩 서버 실패는 503 + error 다(502 도, 빈 결과도 아니다)", async () => {
  const { server } = app([], async () => Promise.reject(new Error("refused")));
  const response = await request(server).get("/api/admin/runs?q=%ED%81%B4%EB%A1%A0&mode=semantic").expect(503);
  assert.match(response.body.error, /refused/);
});

test("GET /runs/filters 는 :id 로 잡히지 않고 이름 목록을 돌려준다", async () => {
  const { server } = app([]);
  const response = await request(server).get("/api/admin/runs/filters").expect(200);
  assert.deepEqual(response.body, { researchers: ["문서", "코드"], procedures: ["P"] });
});

test("GET /runs/:id: 없으면 404 로 기존 동작을 유지한다", async () => {
  const { server } = app([]);
  await request(server).get("/api/admin/runs/99").expect(404);
});
