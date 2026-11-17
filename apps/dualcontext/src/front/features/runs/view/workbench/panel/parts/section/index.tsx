import type { ReactNode } from "react";

/**
 * 노드 상세의 한 구역: 접고 펼 수 있는 제목 줄 + 본문. 기본은 펼침이고 사용자가 접은 상태는 갱신(SSE)에도 유지된다.
 * testId 는 구역마다 다르게 준다(브라우저 테스트가 구역으로 찾는다).
 */
export function Section({ title, testId, defaultOpen = true, children }: { title: string; testId: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <section data-testid={testId} className="rounded-md border border-line">
      <details open={defaultOpen || undefined}>
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-muted">{title}</summary>
        <div className="grid gap-2 border-t border-line p-3 text-sm">{children}</div>
      </details>
    </section>
  );
}
