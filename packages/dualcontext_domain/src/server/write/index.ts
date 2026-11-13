import type { Pair } from "../../common/index.js";

/**
 * 라이터(결정적 기본 구현): (연구원 정보, 프로시저) 쌍을 프로시저 기준으로 묶어
 * 다음 단계용 컨텍스트로 만든다. 근거와 출처를 남기고, 부족한 항목을 표시한다.
 * 프로시저가 요구하는 임팩트를 모델이 추출하는 단계는 이 구현에 없다 —
 * 그 기준을 컨텍스트에 실어 다음 단계가 적용하게 한다.
 */
export function writeContext(query: string, pairs: Pair[]): string {
  const lines: string[] = ["# 증강 컨텍스트", "", `질의: ${query}`, ""];
  const gaps: string[] = [];

  if (pairs.length === 0) gaps.push("선택된 연구원이 없다.");

  for (const pair of pairs) {
    const procedureName = pair.procedure?.name ?? "프로시저 없음";
    lines.push(`## 연구원: ${pair.researcher.name} / 프로시저: ${procedureName}`, "");

    if (pair.procedure) {
      if (pair.procedure.steps.length > 0) lines.push("분석 절차:", ...pair.procedure.steps.map((step, index) => `${index + 1}. ${step}`), "");
      if (pair.procedure.impacts.length > 0) lines.push("추출할 임팩트:", ...pair.procedure.impacts.map((impact) => `- ${impact}`), "");
      if (pair.procedure.outputFormat !== "") lines.push(`출력 형식: ${pair.procedure.outputFormat}`, "");
    } else {
      gaps.push(`${pair.researcher.name}: 적용할 프로시저가 없다.`);
    }

    if (pair.materials.length > 0) {
      lines.push("근거 자료:");
      for (const material of pair.materials) lines.push(`- [출처: ${material.title}] ${material.text}`);
      lines.push("");
    } else {
      gaps.push(`${pair.researcher.name}: 수집된 자료가 없다.`);
    }
  }

  lines.push("## 부족한 항목", "", ...(gaps.length > 0 ? gaps.map((gap) => `- ${gap}`) : ["- 없음"]));
  return lines.join("\n");
}
