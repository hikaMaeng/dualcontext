/**
 * 호출 기록이 없는 옛 실행(노드 상세 기록 기능 이전)의 질의 분해 프롬프트를 재구성한다: 실행 스냅샷에 남은 프롬프트 템플릿에
 * 질의와 아이템 수 상한을 서버(fillPlanPrompt)와 같은 규칙으로 채운다. 실제로 보낸 글이 아니므로 화면이 「재구성」이라고 밝힌다.
 * 템플릿이나 질의를 알 수 없으면 null(지어내지 않는다).
 */
export function reconstructAnalyzePrompt(settings: unknown, query: string, maxItems: number | undefined): string | null {
  const template = (settings as { plan?: { prompts?: { analyze?: unknown } } } | null)?.plan?.prompts?.analyze;
  if (typeof template !== "string" || template === "" || maxItems === undefined) return null;
  const neutralize = (text: string) => text.replace(/<{3,}/g, (marks) => "‹".repeat(marks.length)).replace(/>{3,}/g, (marks) => "›".repeat(marks.length));
  const values: Record<string, string> = { query, max: String(maxItems) };
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => (key in values ? neutralize(values[key] ?? "") : ""));
}
