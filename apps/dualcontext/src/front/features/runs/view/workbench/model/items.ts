import type { PlanItem } from "dualcontext_domain/common";

/** 아이템 id → 이름. 없는 id 는 id 그대로 보인다(숨기지 않는다). */
export function itemName(items: PlanItem[], id: string): string {
  return items.find((item) => item.id === id)?.name ?? id;
}

/** 계획의 단계 수: 아이템이 처음 발견된 단계(level)의 최댓값. 아이템이 없으면 0. */
export function planDepth(items: PlanItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.level), 0);
}

/** 후보 번호 묶음(dedupe 의 members)을 이름 목록으로. 범위를 벗어난 번호는 건너뛴다. */
export function memberNames(candidates: { name: string }[], members: number[]): string[] {
  return members.flatMap((index) => (candidates[index] ? [candidates[index].name] : []));
}
