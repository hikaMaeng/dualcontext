import { RSC as ROOT } from "../../../../../resource";
import type { PanelProps } from "../types";
import { RSC } from "./resource";

/**
 * 조사원 탭: 선택된 (조사원, 프로시저) 쌍과 쌍마다 수집된 근거 자료. 쌍이 아직 없으면 빈 상태를 보인다.
 * 계획 모드에서는 쌍마다 그 쌍을 쓴 컨텍스트 아이템 이름이 앞에 붙는다(같은 조사원이 아이템마다 따로 나올 수 있다).
 */
export function ResearchersPanel({ detail, t }: PanelProps) {
  if (detail.pairs.length === 0) {
    return <p role="status" data-testid="run-pairs-empty" className="text-sm text-muted">{t[ROOT.COMMON_EMPTY_MESSAGE]}</p>;
  }
  return (
    <section aria-label={t[RSC.RUNS_PAIRS_LABEL]} className="grid gap-2">
      <h3 className="text-sm font-semibold text-muted">{t[RSC.RUNS_PAIRS_LABEL]}</h3>
      {detail.pairs.map((pair, index) => (
        <details key={index} data-testid="run-pair" data-item={pair.item} className="rounded-md border border-line p-3 text-sm">
          <summary className="cursor-pointer">
            {pair.item && (
              <span data-testid="run-pair-item" className="me-2 rounded border border-line px-1.5 py-0.5 text-xs text-muted">
                <span className="sr-only">{t[RSC.RUNS_PAIRS_ITEM_LABEL]}: </span>
                {pair.item}
              </span>
            )}
            {pair.researcher} / {pair.procedure ?? "-"} ({pair.materialCount}) [{pair.procedureRouting}]
          </summary>
          {pair.error && <p role="alert" className="mt-2 text-danger">{pair.error}</p>}
          <ul aria-label={t[RSC.RUNS_MATERIALS_LABEL]} className="mt-2 grid gap-2">
            {pair.materials.map((material, at) => (
              <li key={at} className="text-muted"><strong className="text-fg">{material.title}</strong> {material.text}</li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
