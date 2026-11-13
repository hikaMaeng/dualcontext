import type { Pair } from "../../common/index.js";

/**
 * 결정적 라이터: (조사원 정보, 프로시저) 쌍을 프로시저 기준으로 묶어 컨텍스트로 만든다.
 * 근거와 출처를 남기고 부족한 항목을 표시한다. 임팩트 추출은 하지 않고 기준만 싣는다.
 */
export function writeContext(query: string, pairs: Pair[]): string {
  const lines: string[] = ["# 증강 컨텍스트", "", `질의: ${query}`, ""];
  const gaps: string[] = [];

  if (pairs.length === 0) gaps.push("선택된 조사원이 없다.");

  for (const pair of pairs) {
    const procedureName = pair.procedure?.name ?? "프로시저 없음";
    lines.push(`## 조사원: ${pair.researcher.name} / 프로시저: ${procedureName}`, "");

    if (pair.procedure) {
      if (pair.procedure.steps.length > 0) lines.push("분석 절차:", ...pair.procedure.steps.map((step, index) => `${index + 1}. ${step}`), "");
      if (pair.procedure.impacts.length > 0) lines.push("추출할 임팩트:", ...pair.procedure.impacts.map((impact) => `- ${impact}`), "");
      if (pair.procedure.outputFormat !== "") lines.push(`출력 형식: ${pair.procedure.outputFormat}`, "");
    } else {
      gaps.push(`${pair.researcher.name}: 적용할 프로시저가 없다.`);
    }

    if (pair.error) gaps.push(`${pair.researcher.name}: 수집 실패 - ${pair.error}`);
    else if (pair.materials.length === 0) gaps.push(`${pair.researcher.name}: 수집된 자료가 없다.`);
    else {
      lines.push("근거 자료:");
      for (const material of pair.materials) lines.push(`- [출처: ${material.title}] ${material.text}`);
      lines.push("");
    }
  }

  lines.push("## 부족한 항목", "", ...(gaps.length > 0 ? gaps.map((gap) => `- ${gap}`) : ["- 없음"]));
  return lines.join("\n");
}

/** 쌍마다 따로 만든 컨텍스트를 하나로 이어 붙인다. 쌍 사이의 모순은 해결하지 않는다. */
export function mergeContexts(query: string, parts: string[]): string {
  return [`# 증강 컨텍스트`, "", `질의: ${query}`, "", ...parts.flatMap((part) => [part, "", "---", ""])].join("\n").trimEnd();
}
