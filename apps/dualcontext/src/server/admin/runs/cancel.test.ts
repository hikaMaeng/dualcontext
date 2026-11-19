import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import type { Deps } from "../../augment/index.js";
import { createRunContext } from "../../run/index.js";
import { runsRouter } from "./index.js";

const server = () => express().use("/api/admin", runsRouter({ pool: {}, model: {}, dataDir: "" } as unknown as Deps));

test("POST /runs/:id/cancel: 진행 중인 실행을 취소하고 202", async () => {
  const context = createRunContext(8801);
  await request(server()).post("/api/admin/runs/8801/cancel").expect(202);
  assert.equal(context.reason(), "cancelled");
  assert.equal(context.signal.aborted, true);
  context.dispose();
});

test("POST /runs/:id/cancel: 진행 중이 아닌 실행은 404, 잘못된 id 는 400", async () => {
  await request(server()).post("/api/admin/runs/8802/cancel").expect(404);
  await request(server()).post("/api/admin/runs/abc/cancel").expect(400);
});
