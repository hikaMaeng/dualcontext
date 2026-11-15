import assert from "node:assert/strict";
import test from "node:test";
import type { Researcher, RouterConfig } from "dualcontext_domain/common";
import type { ModelClient } from "../model/index.js";
import { defaultRouterConfig } from "./config/index.js";
import { individualPrompt } from "./config/prompts.js";
import { createSelectors } from "./index.js";

const researcher = (id: number, name: string, description: string, router: Researcher["router"] = null): Researcher => ({
  id, name, description, keywords: [], enabled: true, type: "folder", config: {}, procedureIds: [], router
});

/** 글에 「날씨」가 있으면 [1,0], 아니면 [0,1]. 코사인은 같은 방향이면 1, 직교면 0 이다. */
const vectorOf = (text: string) => (text.includes("날씨") ? [1, 0] : [0, 1]);

function setup(config: RouterConfig, answer: (prompt: string) => string = () => "[]") {
  const prompts: string[] = [];
  const pool = { query: async () => ({ rows: [] }) };
  const model = {
    settings: async () => ({ embedding: { model: "fake", baseUrl: "", apiKey: "" }, chat: { model: "fake", baseUrl: "", apiKey: "" } }),
    embed: async (texts: string[]) => texts.map(vectorOf),
    chat: async (prompt: string) => {
      prompts.push(prompt);
      return answer(prompt);
    }
  } as unknown as ModelClient;
  return { selectors: createSelectors(pool as never, model, { config: async () => config }), prompts };
}

const globalConfig = (): RouterConfig => {
  const config = defaultRouterConfig();
  config.researcher = { steps: [{ type: "embedding", topK: 5, minScore: 0.5, margin: 1, parts: true, onError: "none" }] };
  return config;
};

test("개별 라우터가 있는 조사원은 전역 카탈로그에서 빠지고, 통과하면 전역 선택과 합쳐진다", async () => {
  const config = globalConfig();
  config.researcher.steps.push({ type: "llm", topK: 3, prompt: "{{candidates}}", showScores: false, allowNone: true, parts: false, onError: "skip" });
  const web = researcher(7, "웹", "날씨 가격", { steps: [{ type: "embedding", topK: 1, minScore: 0.9, margin: 1, parts: true, onError: "none" }] });
  const { selectors, prompts } = setup(config, () => "[1]");
  const result = await selectors.selectResearchers("오늘 날씨", [researcher(1, "기상 자료", "날씨 관측"), researcher(2, "법률", "판례"), web]);
  assert.deepEqual(result.selected.map((r) => r.name), ["기상 자료", "웹"], "전역 선택 뒤에 개별 통과가 붙는다");
  assert.ok(prompts.length > 0 && prompts.every((p) => !p.includes("웹")), "전역 LLM 후보에 개별 조사원이 없다");
  assert.deepEqual(result.individual?.map((entry) => [entry.researcher, entry.selected]), [["웹", true]]);
  assert.ok(result.scores?.some((entry) => entry.id === 7 && entry.selected), "개별 임베딩 점수가 점수표에 들어간다");
});

test("개별 라우터가 비우면 그 조사원만 제외되고 전역 선택은 그대로다", async () => {
  const web = researcher(7, "웹", "날씨", { steps: [{ type: "embedding", topK: 1, minScore: 0.9, margin: 1, parts: true, onError: "none" }] });
  const { selectors } = setup(globalConfig());
  const result = await selectors.selectResearchers("파이썬 정렬", [researcher(2, "코딩", "파이썬"), web]);
  assert.deepEqual(result.selected.map((r) => r.name), ["코딩"]);
  assert.deepEqual(result.individual?.map((entry) => [entry.researcher, entry.selected]), [["웹", false]]);
});

test("개별 LLM 단계는 그 조사원 하나만 후보로 받고 [id] 이면 포함, [] 이면 제외한다", async () => {
  const web = researcher(7, "웹", "최신 정보", { steps: [{ type: "llm", topK: 1, prompt: individualPrompt, showScores: false, allowNone: true, parts: false, onError: "none" }] });
  const others = [researcher(1, "기상 자료", "날씨"), researcher(2, "법률", "판례")];
  const yes = setup(globalConfig(), () => "[7]");
  const included = await yes.selectors.selectResearchers("지금 환율", [...others, web]);
  assert.ok(included.selected.some((r) => r.id === 7));
  assert.equal(yes.prompts.length, 1, "전역은 임베딩뿐이라 LLM 호출은 개별 판정 한 번");
  assert.ok(yes.prompts[0].includes("id=7") && !yes.prompts[0].includes("id=1"), "후보는 이 조사원 하나");
  const no = setup(globalConfig(), () => "[]");
  assert.ok(!(await no.selectors.selectResearchers("지금 환율", [...others, web])).selected.some((r) => r.id === 7));
});

test("개별 판정이 실패하면 단계의 onError 대로 처리하고 기록에 남긴다", async () => {
  const llmRouter = (onError: "skip" | "none") => ({ steps: [{ type: "llm" as const, topK: 1, prompt: individualPrompt, showScores: false, allowNone: true, parts: false, onError }] });
  const failing = (onError: "skip" | "none") => setup(globalConfig(), () => { throw new Error("busy"); }).selectors.selectResearchers("질의", [researcher(7, "웹", "x", llmRouter(onError))]);
  const open = await failing("skip");
  assert.equal(open.selected.length, 1, "skip 은 실패해도 포함(열림)");
  assert.match(open.individual?.[0].mode ?? "", /failed/);
  assert.equal((await failing("none")).selected.length, 0, "none 은 실패하면 제외(닫힘)");
});

test("하위 질문에서는 parts 가 켜진 개별 단계만 돈다", async () => {
  const web = researcher(7, "웹", "날씨", { steps: [{ type: "llm", topK: 1, prompt: individualPrompt, showScores: false, allowNone: true, parts: false, onError: "none" }] });
  const { selectors, prompts } = setup(globalConfig(), () => "[7]");
  const part = await selectors.selectResearchers("날씨", [web], { part: true });
  assert.equal(prompts.length, 0);
  assert.equal(part.selected.length, 0);
});
