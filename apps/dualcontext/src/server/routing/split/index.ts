import { isRunAborted, type SplitConfig } from "dualcontext_domain/common";
import { parseSplitAnswer, splitQuery } from "dualcontext_domain/server";
import type { ModelClient } from "../../model/index.js";

/**
 * 질의 분해. method 가 none 이면 나누지 않고, heuristic 이면 문장·어미 규칙으로, llm 이면 LLM 이 나눈다.
 * llm 이 실패하면(응답 해석 불가 등) 휴리스틱으로 대신하고 사유를 reason 에 남긴다. 나눌 곳이 없으면 질의 하나만 담긴다.
 */
export async function splitWithConfig(query: string, config: SplitConfig, model: ModelClient): Promise<{ parts: string[]; reason?: string }> {
  if (config.method === "none") return { parts: [query] };
  const heuristic = () => splitQuery(query, { minChars: config.minChars, maxParts: config.maxParts });
  if (config.method === "heuristic") return { parts: heuristic() };
  try {
    const prompt = config.prompt.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => ({ query, maxParts: String(config.maxParts) })[key] ?? "");
    const parts = parseSplitAnswer(await model.chat(prompt), config.maxParts);
    if (parts === null) throw new Error("LLM answer had no question array");
    return { parts: parts.length > 1 ? parts : [query] };
  } catch (error) {
    if (isRunAborted(error)) throw error;
    const reason = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 80);
    return { parts: heuristic(), reason: `llm-split-failed(${reason})->heuristic` };
  }
}
