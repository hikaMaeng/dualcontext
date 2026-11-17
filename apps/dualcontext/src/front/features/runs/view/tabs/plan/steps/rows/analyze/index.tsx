import type { ItemDraft } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../../i18n";
import { RSC } from "./resource";

/** 질의 분석: 모델이 뽑은 핵심 컨텍스트 후보(이름 + 설명). */
export function AnalyzeRow({ drafts, error, t }: { drafts: ItemDraft[]; error?: string; t: Texts }) {
  return (
    <div data-testid="plan-step-analyze" className="grid gap-1">
      {error && <p role="alert" className="text-danger">{t[RSC.RUNS_PLAN_STEPS_ANALYZE_ERROR_LABEL]}: {error}</p>}
      {drafts.length === 0 && !error && <p className="text-muted">{t[RSC.RUNS_PLAN_STEPS_ANALYZE_EMPTY_MESSAGE]}</p>}
      {drafts.length > 0 && (
        <>
          <h5 className="text-xs font-semibold text-muted">{t[RSC.RUNS_PLAN_STEPS_ANALYZE_DRAFTS_LABEL]} ({drafts.length})</h5>
          <ul className="grid gap-0.5">
            {drafts.map((draft, index) => (
              <li key={index}><strong className="text-fg">{draft.name}</strong>{draft.description && <span className="text-muted"> · {draft.description}</span>}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
