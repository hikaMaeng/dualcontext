import type { McpEffort } from "dualcontext_domain/common";
import type { RunPlanChoice } from "../../../../admin/runs/lifecycle/index.js";

/** 도구가 받는 effort 값(입력 스키마 enum). 기본은 light. */
export const efforts = ["light", "middle", "high", "xhigh"] as const satisfies readonly McpEffort[];
export const defaultEffort: McpEffort = "light";

/**
 * effort → 이번 호출의 계획 선택(모드 + 평가 · 보강 라운드 상한). 저장된 관리자 모드는 MCP 호출에 적용하지 않는다.
 * 리플렉션(답변 · 평가) 최대 횟수 = maxRounds + 1 이다(`reevaluateLoop`: 라운드 0 이 첫 리플렉션, round >= maxRounds 에서 멈춤).
 * 그래서 high(최대 2번) → maxRounds 1, xhigh(최대 4번) → maxRounds 3. 그 밖의 한도(단계 · 아이템 수 · 통과 점수)는 관리자 「계획 설정」 값 그대로다.
 */
export function effortChoice(effort: McpEffort): RunPlanChoice {
  switch (effort) {
    case "light":
      return { mode: "classic" };
    case "middle":
      return { mode: "decompose" };
    case "high":
      return { mode: "reevaluate", override: { reevaluate: { maxRounds: 1 } } };
    case "xhigh":
      return { mode: "reevaluate", override: { reevaluate: { maxRounds: 3 } } };
  }
}
