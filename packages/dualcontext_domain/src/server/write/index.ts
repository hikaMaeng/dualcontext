import type { Material, Pair, Procedure, Researcher } from "../../common/index.js";
import type { Provided } from "../plan/ports.js";

/** 웹 검색 계열 조사원인가. 큐레이션한 자료와 달리 출처 신뢰도와 최신성이 균일하지 않아 컨텍스트에서 따로 다룬다. */
export const isWebSource = (researcher: Researcher): boolean => researcher.type === "duckduckgo";

export const webSectionTitle = "웹 검색 결과(검증되지 않은 보조 자료)";
/** 웹 자료를 읽는 법. 모델이 비중을 스스로 정하게 한다: 전문 자료와 어긋나면 그쪽을 우선하고, 질문과 무관하면 쓰지 않는다. */
export const webSectionNote = "공개 웹 검색에서 가져온 조각이다. 출처의 신뢰도와 최신성이 균일하지 않다. 위 조사원 자료와 어긋나면 조사원 자료를 우선하고, 질문과 관련 없으면 쓰지 않는다.";

/** 컨텍스트를 만들 때 큐레이션 쌍이 앞, 웹 검색 쌍이 뒤에 오도록 순서를 정한다(각 쪽의 원래 순서는 유지). */
export const webLast = (pairs: Pair[]): Pair[] => [...pairs.filter((pair) => !isWebSource(pair.researcher)), ...pairs.filter((pair) => isWebSource(pair.researcher))];

export const providedSectionTitle = "사전 제공된 컨텍스트";
/** 사전 컨텍스트를 읽는 법. 앞 아이템에서 이미 만든 것이므로 다시 조사하지 않고 이 질의의 배경으로 쓴다. */
export const providedSectionNote = "이 질의보다 먼저 만들어진 선행 아이템의 컨텍스트다. 아래 자료를 읽기 위한 배경 지식으로 쓰고, 질의와 관련된 부분만 반영한다.";

/** 사전 컨텍스트 안의 머리글을 by 단계 낮춘다(최대 6단계). 들어가는 자리의 머리글 아래로 묶이게 한다. */
const demoteHeadings = (text: string, by: number) => text.replace(/^(#{1,6}) /gm, (_m, marks: string) => `${"#".repeat(Math.min(6, marks.length + by))} `);

/** 사전 컨텍스트 섹션 줄들. 비어 있는 컨텍스트는 싣지 않는다. 템플릿 라이터와 앱의 LLM 라이터가 같은 표기를 쓴다. */
export function describeProvided(provided: Provided[] | undefined, level = 2): string[] {
  const usable = (provided ?? []).filter((entry) => entry.context.trim() !== "");
  if (usable.length === 0) return [];
  const heading = "#".repeat(level);
  return [
    `${heading} ${providedSectionTitle}`,
    "",
    providedSectionNote,
    "",
    ...usable.flatMap((entry) => [`${heading}# ${entry.name}`, "", demoteHeadings(entry.context.trim(), level + 1), ""])
  ];
}

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
  const relevance = material.match === "identifier" ? " (질의에 적힌 표기와 일치)" : material.score === undefined ? "" : ` (질의와의 유사도 ${material.score.toFixed(2)})`;
  return `[${sourceLabel(researcher, index)}] ${material.title}${relevance}\n${material.text}`;
}

/**
 * 결정적 라이터: (조사원, 프로시저) 쌍을 **조사원 기준으로** 묶어 컨텍스트로 만든다.
 * 같은 자료는 한 번만 싣고, 그 조사원에 붙은 프로시저는 「분석 관점」으로 나열한다.
 * 컨텍스트는 명령이 아니라 참고 자료다: 질문과 관련 없으면 쓰지 않아도 된다고 밝히고,
 * 자료마다 출처 번호와 유사도를 붙여 모델이 비중을 스스로 정하게 한다.
 * 「부족한 항목」은 실제로 있을 때만 쓴다(자료가 없거나 수집이 실패한 조사원).
 * provided(사전 컨텍스트)가 있으면 조사원 자료 앞에 「사전 제공된 컨텍스트」 섹션을 둔다. 없으면 이전과 같은 글이다.
 */
export function writeContext(query: string, pairs: Pair[], provided?: Provided[]): string {
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
    "",
    ...describeProvided(provided)
  ];
  const gaps: string[] = [];
  let webOpened = false;

  for (const { researcher, materials, procedures, error } of [...groups.values()].sort((a, b) => Number(isWebSource(a.researcher)) - Number(isWebSource(b.researcher)))) {
    if (error) {
      gaps.push(`${researcher.name}: 수집에 실패했다 - ${error}`);
      continue;
    }
    if (materials.length === 0) {
      gaps.push(`${researcher.name}: 질의와 관련된 자료를 찾지 못했다.`);
      continue;
    }
    if (isWebSource(researcher) && !webOpened) {
      webOpened = true;
      lines.push(`## ${webSectionTitle}`, "", webSectionNote, "");
    }
    lines.push(`${isWebSource(researcher) ? "###" : "##"} 조사원: ${researcher.name}`, "", ...materials.flatMap((material, index) => [describeMaterial(researcher, material, index), ""]));
    if (procedures.length > 0) lines.push("자료를 읽을 때 쓸 수 있는 분석 관점(질문에 맞지 않으면 쓰지 않는다):", ...procedures.map(describeProcedure), "");
  }

  if (gaps.length > 0) lines.push("## 찾지 못한 것", "", ...gaps.map((gap) => `- ${gap}`));
  return lines.join("\n").trimEnd();
}

/** 쌍마다 따로 만든 컨텍스트를 하나로 이어 붙인다. 쌍 사이의 모순은 해결하지 않는다. */
export function mergeContexts(query: string, parts: string[]): string {
  return [`# 참고 자료`, "", `질의: ${query}`, "", ...parts.flatMap((part) => [part, "", "---", ""])].join("\n").trimEnd();
}
