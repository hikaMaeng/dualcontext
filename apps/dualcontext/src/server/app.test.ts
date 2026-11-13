import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "./app.js";

test("GET /health returns dualcontext health", async () => {
  const response = await request(createApp()).get("/health").expect(200);

  assert.deepEqual(response.body, {
    status: "ok",
    service: "dualcontext"
  });
});

test("GET /health reports the database when it answers", async () => {
  const response = await request(createApp({ checkDatabase: async () => true })).get("/health").expect(200);

  assert.deepEqual(response.body, { status: "ok", service: "dualcontext", database: "ok" });
});

test("GET /health answers 503 when the database is unavailable", async () => {
  const response = await request(createApp({ checkDatabase: async () => Promise.reject(new Error("down")) }))
    .get("/health")
    .expect(503);

  assert.deepEqual(response.body, { status: "degraded", service: "dualcontext", database: "unavailable" });
});

test("GET /api/health returns dualcontext health", async () => {
  const response = await request(createApp()).get("/api/health").expect(200);

  assert.deepEqual(response.body, {
    status: "ok",
    service: "dualcontext"
  });
});
