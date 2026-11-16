import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import type pg from "pg";
import { researchersRouter } from "../index.js";
import { defaultProcedureProblem } from "./index.js";

test("기본 프로시저가 없거나 연결된 것이면 문제 없다", () => {
  assert.equal(defaultProcedureProblem([1, 2], null), null);
  assert.equal(defaultProcedureProblem([], null), null);
  assert.equal(defaultProcedureProblem([1, 2], 2), null);
});

test("연결되지 않은 프로시저를 기본으로 두면 이유를 돌려준다", () => {
  assert.match(defaultProcedureProblem([1, 2], 3) ?? "", /defaultProcedureId 3 must be one of/);
  assert.match(defaultProcedureProblem([], 3) ?? "", /none linked/);
});

function app(current: number | null = null) {
  const queries: { text: string; values: unknown[] }[] = [];
  const row = { id: 1, name: "A", description: "", keywords: [], enabled: true, type: "folder", config: {}, router: null, defaultProcedureId: 2, procedureIds: [1, 2] };
  const client = {
    query: async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      if (/select default_procedure_id as current/.test(text)) return { rows: [{ current }] };
      return { rows: /returning id/.test(text) ? [{ id: 1 }] : [] };
    },
    release: () => undefined
  };
  const pool = { connect: async () => client, query: async () => ({ rows: [row] }) } as unknown as pg.Pool;
  return { server: express().use(express.json()).use("/api/admin", researchersRouter(pool)), queries };
}

const valid = { name: "A", type: "folder", config: { path: "/x" }, procedureIds: [1, 2] };

test("POST/PUT: 연결되지 않은 프로시저를 기본으로 지정하면 400 + 명확한 오류이고 아무것도 저장하지 않는다", async () => {
  const { server, queries } = app();
  for (const call of [request(server).post("/api/admin/researchers"), request(server).put("/api/admin/researchers/1")]) {
    const response = await call.send({ ...valid, defaultProcedureId: 9 }).expect(400);
    assert.match(response.body.error, /defaultProcedureId 9 must be one of the researcher's procedureIds/);
  }
  assert.equal(queries.length, 0);
});

test("연결을 해제하면서 그것을 기본으로 남기는 요청도 400 이다", async () => {
  const { server } = app();
  await request(server).put("/api/admin/researchers/1").send({ ...valid, procedureIds: [1], defaultProcedureId: 2 }).expect(400);
});

test("연결된 프로시저를 기본으로 하면 저장되고 응답에 defaultProcedureId 가 담긴다. 생략하면 null 로 저장한다", async () => {
  const { server, queries } = app();
  const response = await request(server).put("/api/admin/researchers/1").send({ ...valid, defaultProcedureId: 2 }).expect(200);
  assert.equal(response.body.defaultProcedureId, 2);
  const update = queries.find((entry) => /update researchers/.test(entry.text));
  assert.ok(update && /default_procedure_id = \$8/.test(update.text));
  assert.equal(update.values[7], 2);

  const created = app();
  await request(created.server).post("/api/admin/researchers").send(valid).expect(201);
  const insert = created.queries.find((entry) => /insert into researchers/.test(entry.text));
  assert.equal(insert?.values[7], null);
});

test("PUT 에서 defaultProcedureId 를 생략하면 기존 기본을 유지하고(옛 클라이언트 보호), 연결이 풀렸으면 null, 명시한 null 은 해제다", async () => {
  const kept = app(2);
  await request(kept.server).put("/api/admin/researchers/1").send(valid).expect(200);
  assert.equal(kept.queries.find((entry) => /update researchers/.test(entry.text))?.values[7], 2);

  const unlinked = app(2);
  await request(unlinked.server).put("/api/admin/researchers/1").send({ ...valid, procedureIds: [1] }).expect(200);
  assert.equal(unlinked.queries.find((entry) => /update researchers/.test(entry.text))?.values[7], null);

  const cleared = app(2);
  await request(cleared.server).put("/api/admin/researchers/1").send({ ...valid, defaultProcedureId: null }).expect(200);
  assert.equal(cleared.queries.find((entry) => /update researchers/.test(entry.text))?.values[7], null);
});
