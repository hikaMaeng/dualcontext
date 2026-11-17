import type { PlanDedupeMethod } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../../i18n";

/** 중복 정리 방법 문구. 키는 호출하는 행 폴더가 자기 resource 로 넘긴다(폴더마다 자기 키만 쓴다). */
export function dedupeMethodText(method: PlanDedupeMethod, t: Texts, keys: { name: string; llm: string; fallback: string }): string {
  return t[method === "name" ? keys.name : method === "llm" ? keys.llm : keys.fallback];
}
