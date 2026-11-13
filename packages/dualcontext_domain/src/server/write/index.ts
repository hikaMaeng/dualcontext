import type { Material, Pair, Procedure, Researcher } from "../../common/index.js";

/** 자료마다 붙는 출처 번호. 조사원 id 와 순서로 정해져, 쌍별 호출로 나뉘어도 번호가 겹치지 않는다. */
export const sourceLabel = (researcher: Researcher, index: number) => `R${researcher.id}-${index + 1}`;

function describeProcedure(procedure: Procedure): string {
  const parts: string[] = [];
  if (procedure.steps.length > 0) parts.push(`볼 순서: ${procedure.steps.join(" → ")}`);
  if (procedure.impacts.length > 0) parts.push(`뽑아 볼 것: ${procedure.impacts.join(" / ")}`);
  if (procedure.outputFormat !== "") parts.push(`정리 형식 제안: ${procedure.outputFormat}`);
  return `- ${procedure.name}${parts.length > 0 ? ` — ${parts.join("; ")}` : ""}`;
}

function describeMaterial(researcher: Researcher, material: Material, index: number): string {
  const relevance = material.score === undefined ? "" : ` (질의와의 유사도 ${material.score.toFixed(2)})`;
  return `[${sourceLabel(researcher, index)}] ${material.title}${relevance}\n${material.text}`;
}

/**
 * 결정적 라이터: (조사원, 프로시저) 쌍을 **조사원 기준으로** 묶어 컨텍스트로 만든다.
 * 같은 자료는 한 번만 싣고, 그 조사원에 붙은 프로시저는 「분석 관점」으로 나열한다.
 * 컨텍스트는 명령이 아니라 참고 자료다: 질문과 관련 없으면 쓰지 않아도 된다고 밝히고,
 * 자료마다 출처 번호와 유사도를 붙여 모델이 비중을 스스로 정하게 한다.
 * 「부족한 항목」은 실제로 있을 때만 쓴다(자료가 없거나 수집이 실패한 조사원).
 */
export function writeContext(query: string, pairs: Pair[]): string {
  const groups = new Map<number, { researcher: Researcher; materials: Material[]; procedures: Procedure[]; error?: string }>();
  for (const pair of pairs) {
    const group = groups.get(pair.researcher.id) ?? { researcher: pair.researcher, materials: pair.materials, procedures: [], error: pair.error };
    if (pair.procedure && !group.procedures.some((procedure) => procedure.id === pair.procedure?.id)) group.procedures.push(pair.procedure);
    groups.set(pair.researcher.id, group);
  }

  const lines: string[] = [
    "# 참고 자료",
    "",
    `질의: ${query}`,
    "",
    "조사원들이 질의와 관련해 모은 자료다. 답을 정하는 근거가 아니라 참고용이다. 질문과 관련 없는 자료는 쓰지 않아도 된다.",
    ""
  ];
  const gaps: string[] = [];

  for (const { researcher, materials, procedures, error } of groups.values()) {
    if (error) {
      gaps.push(`${researcher.name}: 수집에 실패했다 - ${error}`);
      continue;
    }
    if (materials.length === 0) {
      gaps.push(`${researcher.name}: 질의와 관련된 자료를 찾지 못했다.`);
      continue;
    }
    lines.push(`## 조사원: ${researcher.name}`, "", ...materials.flatMap((material, index) => [describeMaterial(researcher, material, index), ""]));
    if (procedures.length > 0) lines.push("자료를 읽을 때 쓸 수 있는 분석 관점(질문에 맞지 않으면 쓰지 않는다):", ...procedures.map(describeProcedure), "");
  }

  if (gaps.length > 0) lines.push("## 찾지 못한 것", "", ...gaps.map((gap) => `- ${gap}`));
  return lines.join("\n").trimEnd();
}

/** 쌍마다 따로 만든 컨텍스트를 하나로 이어 붙인다. 쌍 사이의 모순은 해결하지 않는다. */
export function mergeContexts(query: string, parts: string[]): string {
  return [`# 참고 자료`, "", `질의: ${query}`, "", ...parts.flatMap((part) => [part, "", "---", ""])].join("\n").trimEnd();
}
