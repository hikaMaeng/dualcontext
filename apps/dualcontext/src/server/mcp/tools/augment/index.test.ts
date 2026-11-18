import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import type { AugmentResult, PlanTrace } from "dualcontext_domain/common";
import type { Deps, RunAugmentEngine } from "../../../augment/index.js";
import { defaultPlanConfig } from "../../../plan/config/index.js";
import { defaultRouterConfig } from "../../../routing/config/index.js";
import { description, registerAugmentTool } from "./index.js";

const built: AugmentResult = {
  context: "컨텍스트 본문",
  routing: { researchers: [], procedures: [] },
  researcherRouting: "embedding",
  pairs: [],
  writer: { mode: "batch", calls: 1 }
};

type Args = { query: string; effort?: string };
type Handler = (args: Args) => Promise<{ isError?: boolean; content: { type: string; text: string }[] }>;
type Field = { isOptional(): boolean };
const captured: { schema: { query: Field; effort: Field } } = { schema: null as never };

/** 도구 등록만 받아 핸들러와 입력 스키마를 꺼내는 가짜 MCP 서버. */
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
  const server = { registerTool: (_name: string, config: { inputSchema: typeof captured.schema }, run: Handler) => { handler = run; captured.schema = config.inputSchema; } };
  registerAugmentTool(server as never, { pool, model, dataDir: "" } as unknown as Deps, engine);
  return { run: (args: Args) => (handler as Handler)(args), calls, chats };
}

const ok: RunAugmentEngine = { augment: async () => built, planContext: async () => { throw new Error("부르면 안 된다"); } };
const final = (calls: { text: string; values: unknown[] }[]) => calls.find((call) => /set status = \$2/.test(call.text));
const body = (text: string) => text.slice(text.indexOf("---\n") + 4);

test("MCP 호출은 출처 mcp · 기본 effort light 로 실행 로그에 남고, 머리 + 컨텍스트만 돌려준다(답변을 만들지 않는다)", async () => {
  const { run, calls, chats } = register(ok);
  const result = await run({ query: "질의" });
  assert.equal(result.content.length, 1);
  assert.match(result.content[0].text, /^\[dualcontext\] effort=light coverage=ok sources=0 elapsed=\d+s\nnext: -\n---\n컨텍스트 본문$/);
  const insert = calls.find((call) => /^insert into augment_runs/.test(call.text));
  assert.ok(insert, "실행 행이 만들어져야 한다");
  assert.equal(insert.values[0], "질의");
  assert.equal(insert.values[2], "mcp");
  assert.equal(insert.values[3], "light");
  assert.equal(final(calls)?.values[1], "ok");
  assert.equal(chats.length, 0, "최종 답변(증강 전 · 후) 모델 호출이 없어야 한다");
  assert.equal(calls.some((call) => /jsonb_build_object/.test(call.text)), false, "답변 열을 쓰면 안 된다");
});

test("effort 는 이번 호출의 모드를 정하고(저장 모드 무시) 실행 로그에 기록된다", async () => {
  const modes: string[] = [];
  const spy: RunAugmentEngine = {
    augment: async () => { modes.push("classic"); return built; },
    planContext: async (_query, options) => {
      modes.push(`${options.config.mode}:${options.config.reevaluate.maxRounds}`);
      const trace = { mode: options.config.mode, items: [], levels: [], waves: [], steps: [], rounds: [], stop: "passed", ms: 1 } as unknown as PlanTrace;
      return { context: "계획 컨텍스트", trace };
    }
  };
  const { run, calls } = register(spy, { ...defaultPlanConfig(), mode: "classic" });
  await run({ query: "a", effort: "middle" });
  await run({ query: "b", effort: "high" });
  await run({ query: "c", effort: "xhigh" });
  assert.deepEqual(modes, [`decompose:${defaultPlanConfig().reevaluate.maxRounds}`, "reevaluate:1", "reevaluate:3"]);
  assert.deepEqual(calls.filter((call) => /^insert into augment_runs/.test(call.text)).map((call) => call.values[3]), ["middle", "high", "xhigh"]);
});

test("컨텍스트가 비면 coverage=none 안내를 돌려주고(빈 content 가 아니다) 실행은 ok 로 남는다", async () => {
  const { run, calls } = register({ augment: async () => ({ ...built, context: "" }), planContext: async () => { throw new Error("x"); } });
  const result = await run({ query: "질의" });
  assert.match(result.content[0].text, /coverage=none/);
  assert.match(body(result.content[0].text), /^No matching source/);
  assert.equal(final(calls)?.values[1], "ok");
});

test("증강이 실패하면 isError 와 한 줄 오류가 돌아오고 실행 로그에도 error 로 남는다", async () => {
  const { run, calls } = register({ augment: async () => { throw new Error("라우팅 실패"); }, planContext: async () => { throw new Error("x"); } });
  const result = await run({ query: "질의" });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "error: 라우팅 실패. next: effort=light, or answer without context.");
  assert.equal(final(calls)?.values[1], "error");
  assert.equal(final(calls)?.values[2], "라우팅 실패");
});

test("도구 설명: 컨텍스트만 · 정보 필요 단위 · 같은 단계 재질의 금지 · coverage=none 재시도 금지가 있고, 예시와 질문 단위 한 번 규칙은 없다", () => {
  register(ok);
  const all = [description, JSON.stringify(Object.keys(captured.schema))].join(" ");
  for (const must of ["context only, never an answer", "one information need", "higher effort", "coverage=none"]) assert.ok(all.includes(must), must);
  for (const banned of ["e.g.", "for example", "퇴직금", "once per question"]) assert.equal(all.includes(banned), false, banned);
  // 장기 실행 경고: 도구 설명과 effort 설명 양쪽에 있고, 클라이언트 제한 시간 · 취소 불가 · 사용자 동의 조건을 말한다.
  assert.match(description, /WARNING, long-running/);
  assert.match(description, /stop waiting after about a minute/);
  assert.match(description, /cannot be cancelled/);
  assert.match(description, /only when the user has accepted a long wait/);
  const effortText = (captured.schema.effort as unknown as { description?: string }).description ?? "";
  assert.match(effortText, /tens of minutes to over an hour/);
  assert.match(effortText, /unless the user accepted a long wait/);
  assert.equal(captured.schema.effort.isOptional(), true);
  assert.equal(captured.schema.query.isOptional(), false);
});
