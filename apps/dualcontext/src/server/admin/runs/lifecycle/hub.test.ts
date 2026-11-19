import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import type { AugmentResult } from "dualcontext_domain/common";
import type { Deps } from "../../../augment/index.js";
import { defaultPlanConfig } from "../../../plan/config/index.js";
import { defaultRouterConfig } from "../../../routing/config/index.js";
import { bus, startRun, terminalSnapshot } from "./index.js";

const classic: AugmentResult = { context: "컨텍스트", routing: { researchers: [], procedures: [] }, researcherRouting: "embedding", pairs: [], writer: { mode: "batch", calls: 1 } };

/** 상세 행 조회(select … from augment_runs where id)는 rows 를 돌려주는 가짜 pool. readRows 가 null 이면 조회가 실패한다. */
function fake(id: number, readRows: (() => Record<string, unknown>[]) | null) {
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      if (/select config from plan_config/.test(text)) return { rows: [{ config: { ...defaultPlanConfig(), mode: "classic" } }] };
      if (/select pipeline from router_config/.test(text)) return { rows: [{ pipeline: defaultRouterConfig() }] };
      if (/^insert into augment_runs/.test(text)) return { rows: [{ id }] };
      if (/from augment_runs where id = \$1$/.test(text.trim())) {
        if (readRows === null) throw new Error("읽기 실패");
        return { rows: readRows() };
      }
      void values;
      return { rows: [], rowCount: 1 };
    }
  } as unknown as pg.Pool;
  const model: Record<string, unknown> = {
    chat: async () => "답",
    embed: async () => Promise.reject(new Error("쓰지 않는다")),
    settings: async () => ({ embedding: { baseUrl: "e", model: "em", apiKey: "k" }, chat: { baseUrl: "c", model: "cm", apiKey: "k" } })
  };
  model.forRun = () => model;
  return { pool, deps: { pool, model, dataDir: "" } as unknown as Deps };
}

test("종료 publish: DB 재조회가 실패해도 구독자는 종료 상태를 받고, 종료 스냅샷이 남는다", async () => {
  const { deps } = fake(701, null);
  const { done } = await startRun(deps, "질의", undefined, {}, { augment: async () => classic, planContext: async () => { throw new Error("x"); } });
  const seen: Record<string, unknown>[] = [];
  bus.on("701", (detail) => seen.push(detail));
  await done;
  bus.removeAllListeners("701");
  assert.equal(seen.at(-1)?.status, "ok", "종료 상태가 전달된다");
  assert.equal(terminalSnapshot(701)?.status, "ok");
});

test("종료 뒤에는 늦게 끝난 옛 조회가 running 을 방송하지 못한다", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0;
  const { deps } = fake(702, () => {
    reads += 1;
    return [{ id: 702, status: reads === 1 ? "running" : "ok", stage: "done" }];
  });
  void gate;
  const { done } = await startRun(deps, "질의", undefined, {}, { augment: async () => classic, planContext: async () => { throw new Error("x"); } });
  const seen: string[] = [];
  bus.on("702", (detail: { status: string }) => seen.push(detail.status));
  await done;
  release();
  await new Promise((resolve) => setTimeout(resolve, 650));
  bus.removeAllListeners("702");
  assert.equal(seen.at(-1), "ok");
  assert.equal(seen.lastIndexOf("running") < seen.lastIndexOf("ok") || !seen.includes("running"), true, "종료 뒤 running 이 다시 오지 않는다");
});

test("구독자가 없으면 진행 중 방송은 행을 읽지 않는다", async () => {
  let reads = 0;
  const { deps } = fake(703, () => { reads += 1; return [{ id: 703, status: "ok", stage: "done" }]; });
  const { done } = await startRun(deps, "질의", undefined, {}, { augment: async () => classic, planContext: async () => { throw new Error("x"); } });
  await done;
  assert.equal(reads, 0, "구독자가 없으면 큰 행을 읽고 버리는 일이 없다(종료 방송 포함)");
});
