import type { PlanItem } from "../../../common/index.js";

/**
 * 최종 컨텍스트: top 아이템 중 status=built 이고 컨텍스트가 비지 않은 것만 `## 이름` 섹션으로 잇는다(아이템 생성 순서).
 * 하나도 없으면 빈 문자열. 사전 아이템 컨텍스트는 의존하는 아이템 컨텍스트에 이미 녹아 있으므로 싣지 않는다.
 * see docs/plan.md#assemble
 */
export function assembleContext(items: PlanItem[]): string {
  return items
    .filter((item) => item.top && item.status === "built" && item.context.trim() !== "")
    .map((item) => `## ${item.name}\n\n${item.context.trim()}`)
    .join("\n\n");
}
