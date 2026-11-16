import { MarkdownText } from "../../../../../components/markdown";
import type { PanelProps } from "../types";
import { looksLikeMarkdown } from "./markdown";
import { RSC } from "./resource";

/**
 * 컨텍스트 탭: 생성된 컨텍스트 본문(마크다운이면 렌더, 아니면 기존대로 원문 그대로)과,
 * 그 컨텍스트가 만들어질 때의 설정 스냅샷(라우터 · 라이터 · 모델 · 프롬프트). 설정은 컨텍스트가 어떻게 만들어졌는지의
 * 근거라 이 탭 아래에 함께 둔다.
 */
export function ContextPanel({ detail, t }: PanelProps) {
  const markdown = detail.context !== null && looksLikeMarkdown(detail.context);
  return (
    <>
      <section aria-label={t[RSC.RUNS_CONTEXT_LABEL]} className="grid gap-1">
        <h3 className="text-sm font-semibold text-muted">{t[RSC.RUNS_CONTEXT_LABEL]}</h3>
        {!detail.context && <p role="status" data-testid="run-context-empty" className="text-sm text-muted">{t[RSC.RUNS_CONTEXT_EMPTY_MESSAGE]}</p>}
        {detail.context && markdown && (
          <div data-testid="run-context" data-format="markdown" className="max-h-[40rem] overflow-auto break-words rounded-md border border-line bg-sidebar p-3 text-sm leading-6">
            <MarkdownText text={detail.context} />
          </div>
        )}
        {detail.context && !markdown && (
          <pre data-testid="run-context" data-format="text" className="max-h-[40rem] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-sidebar p-3 font-mono text-sm">{detail.context}</pre>
        )}
      </section>
      <section aria-label={t[RSC.RUNS_SETTINGS_LABEL]} className="grid gap-1">
        <h3 className="text-sm font-semibold text-muted">{t[RSC.RUNS_SETTINGS_LABEL]}</h3>
        <pre data-testid="run-settings" className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-sidebar p-3 font-mono text-xs">{JSON.stringify(detail.settings, null, 2)}</pre>
      </section>
    </>
  );
}
