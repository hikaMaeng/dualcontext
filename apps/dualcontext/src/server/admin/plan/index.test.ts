import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import type pg from "pg";
import type { Deps } from "../../augment/index.js";
import { defaultPlanConfig } from "../../plan/config/index.js";
import { defaultPlanPrompts } from "../../plan/prompts/index.js";
import { adminRouter } from "../index.js";
import { planRouter } from "./index.js";

/** plan_config 한 행을 메모리에 두는 가짜 pool. */
function app(initial: unknown = undefined) {
  let stored = initial;
  const writes: unknown[] = [];
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      if (/^insert into plan_config/.test(text)) {
        stored = JSON.parse(String(values[0]));
        writes.push(stored);
        return { rows: [] };
      }
      if (/select config from plan_config/.test(text)) return { rows: stored === undefined ? [] : [{ config: stored }] };
      return { rows: [] };
    }
  } as unknown as pg.Pool;
  return { server: express().use(express.json()).use("/api/admin", planRouter(pool)), writes };
}

test("GET /plan/config: 행이 없으면 기본 설정(classic)", async () => {
  const response = await request(app().server).get("/api/admin/plan/config").expect(200);
  assert.deepEqual(response.body, defaultPlanConfig());
});

test("PUT /plan/config: 검증을 통과하면 저장하고 저장된 값을 돌려준다", async () => {
  const { server, writes } = app();
  const body = { ...defaultPlanConfig(), mode: "reevaluate", maxLevels: 2, reevaluate: { maxRounds: 1, passScore: 70, maxMissing: 1, maxNewItems: 2 } };
  const response = await request(server).put("/api/admin/plan/config").send(body).expect(200);
  assert.equal(response.body.mode, "reevaluate");
  assert.equal(response.body.maxLevels, 2);
  assert.equal(writes.length, 1);
  const again = await request(server).get("/api/admin/plan/config").expect(200);
  assert.deepEqual(again.body.reevaluate, { maxRounds: 1, passScore: 70, maxMissing: 1, maxNewItems: 2 });
});

test("PUT /plan/config: 범위 밖 · 빠진 필드는 400 + error, 저장하지 않는다", async () => {
  const { server, writes } = app();
  for (const body of [{ ...defaultPlanConfig(), maxLevels: 0 }, { ...defaultPlanConfig(), mode: "x" }, { mode: "decompose" }, { ...defaultPlanConfig(), prompts: { analyze: "a" } }]) {
    const response = await request(server).put("/api/admin/plan/config").send(body).expect(400);
    assert.equal(typeof response.body.error, "string");
  }
  assert.equal(writes.length, 0);
});

test("GET /plan/defaults: { config, prompts{analyze,prerequisites,dedupe,evaluate} }", async () => {
  const response = await request(app({ ...defaultPlanConfig(), mode: "decompose" }).server).get("/api/admin/plan/defaults").expect(200);
  assert.deepEqual(Object.keys(response.body).sort(), ["config", "prompts"]);
  assert.equal(response.body.config.mode, "classic");
  assert.deepEqual(response.body.prompts, { ...defaultPlanPrompts });
});

test("POST /augment: mode · plan 이 틀리면 400 이고 실행을 만들지 않는다(plan 은 숫자 한도만)", async () => {
  const calls: string[] = [];
  const pool = { query: async (text: string) => { calls.push(text); return { rows: [] }; } } as unknown as pg.Pool;
  const server = express().use("/api/admin", adminRouter({ pool, model: {}, dataDir: "" } as unknown as Deps));
  for (const body of [{ query: "q", mode: "deep" }, { query: "q", plan: { maxLevels: 9 } }, { query: "q", plan: { prompts: { analyze: "x" } } }, { query: "q", plan: { mode: "decompose" } }]) {
    const response = await request(server).post("/api/admin/augment").send(body).expect(400);
    assert.equal(typeof response.body.error, "string");
  }
  assert.equal(calls.some((text) => /insert into augment_runs/.test(text)), false);
});
