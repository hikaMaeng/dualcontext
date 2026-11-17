import { MarkdownText } from "../../../../../../../components/markdown";
import type { Texts } from "../../../../../../../i18n";
import { looksLikeMarkdown } from "./markdown";
import { RSC } from "./resource";

/**
 * 만들어진 컨텍스트 본문: 마크다운이면 렌더하고 아니면 원문 그대로 보인다. 비어 있으면 빈 상태 문구.
 * 길면 높이를 제한하고 스크롤하되 패널을 확대하면 훨씬 크게 보인다.
 */
export function ContextBox({ text, testId = "run-context", t }: { text: string | null | undefined; testId?: string; t: Texts }) {
  if (!text) return <p role="status" data-testid={`${testId}-empty`} className="text-sm text-muted">{t[RSC.RUNS_CONTEXT_EMPTY_MESSAGE]}</p>;
  return looksLikeMarkdown(text) ? (
    <div data-testid={testId} data-format="markdown" className="max-h-96 overflow-auto break-words rounded-md border border-line bg-sidebar p-3 text-sm leading-6 group-data-[expanded=true]/panel:max-h-[75vh]">
      <MarkdownText text={text} />
    </div>
  ) : (
    <pre data-testid={testId} data-format="text" className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-sidebar p-3 font-mono text-sm group-data-[expanded=true]/panel:max-h-[75vh]">{text}</pre>
  );
}
