/** 긴 글(프롬프트 · 응답 · 원문). 높이를 제한하고 스크롤하되 패널을 확대하면(상위의 data-expanded) 훨씬 크게 보인다. */
export function TextBox({ text, testId }: { text: string; testId?: string }) {
  return (
    <pre data-testid={testId} className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-sidebar p-3 font-mono text-xs group-data-[expanded=true]/panel:max-h-[70vh]">{text}</pre>
  );
}
