import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import express from "express";
import request from "supertest";
import type { Deps } from "../../../augment/index.js";
import { runsRouter } from "../index.js";
import { createNodeSaver, readNode, validNodeKey } from "./index.js";

type Call = { text: string; values: unknown[] };

/** 노드 upsert 를 메모리 맵(jsonb || 병합 흉내)에 반영하는 가짜 pool. gate 가 있으면 첫 쓰기를 붙잡는다. */
function fakePool(opts: { gate?: Promise<void>; failOn?: (key: string, n: number) => boolean } = {}) {
  const store = new Map<string, Record<string, unknown>>();
  const writes: string[] = [];
  let n = 0;
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      if (/insert into augment_run_nodes/.test(text)) {
        n += 1;
        if (n === 1 && opts.gate) await opts.gate;
        const key = String(values[1]);
        if (opts.failOn?.(key, n)) throw new Error("쓰기 실패");
        writes.push(key);
        store.set(key, { ...(store.get(key) ?? {}), ...JSON.parse(String(values[2])) });
        return { rows: [], rowCount: 1 };
      }
      if (/select detail from augment_run_nodes/.test(text)) {
        const found = store.get(`${values[0]}:${values[1]}`) ?? store.get(String(values[1]));
        return { rows: found ? [{ detail: found }] : [] };
      }
      return { rows: [] };
    }
  } as unknown as pg.Pool;
  return { pool, store, writes };
}

test("createNodeSaver: 같은 키 조각은 필드별로 합쳐 한 문서가 되고 key · at 이 붙는다", async () => {
  const { pool, store } = fakePool();
  const saved: number[] = [];
  const saver = createNodeSaver(pool, 1, async () => void saved.push(1), () => new Date("2026-01-02T03:04:05Z"));
  saver.push("item:i1", { prerequisitesCalls: [{ seq: 1, prompt: "p", response: "r", ms: 1, at: "t" }] });
  await saver.settle();
  saver.push("item:i1", { calls: [], provided: [] });
  await saver.settle();
  const doc = store.get("item:i1") as Record<string, unknown>;
  assert.equal(doc.key, "item:i1");
  assert.equal(doc.at, "2026-01-02T03:04:05.000Z");
  assert.ok(Array.isArray(doc.prerequisitesCalls) && Array.isArray(doc.calls), "두 조각이 한 문서에 있다");
  assert.equal(saved.length, 2, "쓸 때마다 방송 콜백");
});

test("createNodeSaver: 쓰는 동안 같은 키가 여러 번 오면 대기 중에 합쳐 한 번만 쓰고, 다른 키는 따로 쓴다", async () => {
  let open: () => void = () => undefined;
  const { pool, writes, store } = fakePool({ gate: new Promise<void>((resolve) => { open = resolve; }) });
  const saver = createNodeSaver(pool, 1, async () => undefined);
  saver.push("a", { calls: [] });
  saver.push("b", { calls: [] });
  saver.push("b", { error: "x" });
  saver.push("b", { provided: [] });
  open();
  await saver.settle();
  assert.deepEqual(writes, ["a", "b"], "b 는 한 번");
  assert.deepEqual(Object.keys(store.get("b") as object).sort(), ["at", "calls", "error", "key", "provided"]);
});

test("createNodeSaver: 쓰기 실패는 던지지 않고 다음 키를 계속 쓴다", async () => {
  const { pool, writes } = fakePool({ failOn: (key) => key === "a" });
  const saver = createNodeSaver(pool, 1, async () => undefined);
  saver.push("a", { calls: [] });
  saver.push("b", { calls: [] });
  await saver.settle();
  assert.deepEqual(writes, ["b"]);
});

test("validNodeKey: 키 규칙의 문자만 받는다", () => {
  for (const ok of ["classic", "analyze", "item:i12", "dedupe:1:seed", "answer:before", "evaluate:2"]) assert.equal(validNodeKey(ok), true, ok);
  for (const bad of ["", "a b", "x/../y", "item:i1;drop", "k".repeat(65), "한글"]) assert.equal(validNodeKey(bad), false, bad);
});

test("readNode: 실행 id 와 키로 한 문서를 읽고 없으면 null", async () => {
  const pool = { query: async (_t: string, v: unknown[]) => ({ rows: v[1] === "item:i1" ? [{ detail: { key: "item:i1", calls: [], at: "t" } }] : [] }) } as unknown as pg.Pool;
  assert.deepEqual(await readNode(pool, 5, "item:i1"), { key: "item:i1", calls: [], at: "t" });
  assert.equal(await readNode(pool, 5, "item:i9"), null);
});

test("GET /runs/:id/nodes/:key: 인코딩된 ':' 를 풀어 읽고, 없으면 404, 잘못된 키는 400", async () => {
  const seen: unknown[][] = [];
  const pool = {
    query: async (_t: string, v: unknown[]) => {
      seen.push(v);
      return { rows: v[1] === "item:i3" ? [{ detail: { key: "item:i3", calls: [], at: "t" } }] : [] };
    }
  } as unknown as pg.Pool;
  const server = express().use("/api/admin", runsRouter({ pool, model: {}, dataDir: "" } as unknown as Deps));
  const ok = await request(server).get("/api/admin/runs/7/nodes/item%3Ai3").expect(200);
  assert.equal(ok.body.key, "item:i3");
  assert.deepEqual(seen[0], [7, "item:i3"]);
  await request(server).get("/api/admin/runs/7/nodes/item%3Ai99").expect(404);
  await request(server).get("/api/admin/runs/7/nodes/a%20b").expect(400);
  await request(server).get("/api/admin/runs/abc/nodes/classic").expect(400);
});
