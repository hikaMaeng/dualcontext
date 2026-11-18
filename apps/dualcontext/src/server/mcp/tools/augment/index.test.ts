import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import type { AugmentResult } from "dualcontext_domain/common";
import type { Deps, RunAugmentEngine } from "../../../augment/index.js";
import { defaultPlanConfig } from "../../../plan/config/index.js";
import { defaultRouterConfig } from "../../../routing/config/index.js";
import { registerAugmentTool } from "./index.js";

const built: AugmentResult = {
  context: "컨텍스트 본문",
  routing: { researchers: [], procedures: [] },
  researcherRouting: "embedding",
  pairs: [],
  writer: { mode: "batch", calls: 1 }
};

type Handler = (args: { query: string }) => Promise<{ content: { type: string; text: string }[] }>;

/** 도구 등록만 받아 핸들러를 꺼내는 가짜 MCP 서버. */
function register(engine: RunAugmentEngine, stored: unknown = defaultPlanConfig()) {
  const calls: { text: string; values: unknown[] }[] = [];
  const chats: string[] = [];
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      if (/select config from plan_config/.test(text)) return { rows: [{ config: stored }] };
      if (/select pipeline from router_config/.test(text)) return { rows: [{ pipeline: defaultRouterConfig() }] };
      if (/^insert into augment_runs/.test(text)) return { rows: [{ id: 9 }] };
      return { rows: [], rowCount: 1 };
    }
  } as unknown as pg.Pool;
  const model = {
    chat: async (prompt: string) => { chats.push(prompt); return "서버 답변 표식"; },
    embed: async () => Promise.reject(new Error("쓰지 않는다")),
    settings: async () => ({ embedding: { baseUrl: "e", model: "em", apiKey: "k" }, chat: { baseUrl: "c", model: "cm", apiKey: "k" } })
  };
  let handler: Handler | null = null;
  const server = { registerTool: (_name: string, _config: unknown, run: Handler) => { handler = run; } };
  registerAugmentTool(server as never, { pool, model, dataDir: "" } as unknown as Deps, engine);
  return { run: (query: string) => (handler as Handler)({ query }), calls, chats };
}

const ok: RunAugmentEngine = { augment: async () => built, planContext: async () => { throw new Error("부르면 안 된다"); } };

test("MCP 호출은 출처 mcp 로 실행 로그에 남고, 컨텍스트만 돌려준다(답변을 만들지 않는다)", async () => {
  const { run, calls, chats } = register(ok);
  const result = await run("질의");
  assert.deepEqual(result.content, [{ type: "text", text: "컨텍스트 본문" }]);
  const insert = calls.find((call) => /^insert into augment_runs/.test(call.text));
  assert.ok(insert, "실행 행이 만들어져야 한다");
  assert.equal(insert.values[0], "질의");
  assert.equal(insert.values[2], "mcp");
  const final = calls.find((call) => /set status = \$2/.test(call.text));
  assert.equal(final?.values[1], "ok");
  assert.equal(chats.length, 0, "최종 답변(증강 전 · 후) 모델 호출이 없어야 한다");
  assert.equal(calls.some((call) => /jsonb_build_object/.test(call.text)), false, "답변 열을 쓰면 안 된다");
});

test("컨텍스트가 비면 빈 content 를 돌려주고 실행은 ok 로 남는다", async () => {
  const { run, calls } = register({ augment: async () => ({ ...built, context: "" }), planContext: async () => { throw new Error("x"); } });
  assert.deepEqual((await run("질의")).content, []);
  assert.equal(calls.find((call) => /set status = \$2/.test(call.text))?.values[1], "ok");
});

test("증강이 실패하면 도구 호출이 오류가 되고 실행 로그에도 error 로 남는다", async () => {
  const { run, calls } = register({ augment: async () => { throw new Error("라우팅 실패"); }, planContext: async () => { throw new Error("x"); } });
  await assert.rejects(() => run("질의"), /라우팅 실패/);
  const final = calls.find((call) => /set status = \$2/.test(call.text));
  assert.equal(final?.values[1], "error");
  assert.equal(final?.values[2], "라우팅 실패");
});
