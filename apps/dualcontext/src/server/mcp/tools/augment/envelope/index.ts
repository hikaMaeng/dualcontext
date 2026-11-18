import type { AugmentResult, McpEffort, PlanTrace } from "dualcontext_domain/common";

/**
 * MCP 응답의 고정 머리 + 본문. 호스트가 본문을 읽지 않고도 수행 단계와 충분 여부를 알게 한다.
 * 본문은 최종 컨텍스트 하나뿐이다: 서버 안에서 만든 답변 · 평가 점수 · 평가 이유 · 프롬프트는 싣지 않는다(missing 은 부족한 컨텍스트의 이름 · 설명만).
 *
 * coverage: none = 마땅한 조사원이 없어 컨텍스트가 비었다 / partial = high · xhigh 에서 평가가 통과하지 못한 채 멈췄다(충분함을 확인하지 못했다) / ok = 그 외.
 * 평가가 없는 light · middle 은 ok · none 만 낸다.
 */
export type Coverage = "ok" | "partial" | "none";

export type ReplyInput = { effort: McpEffort; result: AugmentResult; plan: PlanTrace | null; elapsedMs: number };

const evaluated = (effort: McpEffort) => effort === "high" || effort === "xhigh";

/** 평가를 거친 effort 에서, 평가가 통과해 멈춘 것이 아니면 partial. */
export function coverageOf({ effort, result, plan }: Pick<ReplyInput, "effort" | "result" | "plan">): Coverage {
  if (result.context.trim() === "") return "none";
  if (evaluated(effort) && plan !== null && plan.stop !== "passed") return "partial";
  return "ok";
}

/** 마지막 평가가 요구한 부족 컨텍스트(이름 · 설명). 평가가 없으면 빈 배열. */
function missingOf(plan: PlanTrace | null): { name: string; description: string }[] {
  const last = plan?.rounds.at(-1)?.evaluation;
  return last ? last.missing.map(({ name, description }) => ({ name, description })) : [];
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

export function buildReply(input: ReplyInput): string {
  const { effort, result, plan, elapsedMs } = input;
  const coverage = coverageOf(input);
  const sources = new Set(result.pairs.map((pair) => pair.researcher)).size;
  const head = [`[dualcontext] effort=${effort}`, `coverage=${coverage}`, `sources=${sources}`];
  if (evaluated(effort) && plan !== null) head.push(`reflections=${plan.rounds.length}`);
  head.push(`elapsed=${Math.round(elapsedMs / 1000)}s`);
  // 올림 안내는 high 가 partial 일 때만 한다. 그 밖(none · xhigh · 평가 없는 단계)은 항상 「-」.
  const next = effort === "high" && coverage === "partial" ? "effort=xhigh" : "-";
  const lines = [head.join(" "), `next: ${next}`];
  if (coverage === "partial") for (const { name, description } of missingOf(plan)) lines.push(`missing: ${oneLine(name)}${description ? ` - ${oneLine(description)}` : ""}`);
  lines.push("---");
  lines.push(coverage === "none" ? "No matching source for this query. Do not retry; answer from your own knowledge." : result.context);
  return lines.join("\n");
}

/** 호출 오류의 한 줄(isError 와 함께 돌려준다). */
export function buildError(message: string): string {
  return `error: ${oneLine(message)}. next: effort=light, or answer without context.`;
}
