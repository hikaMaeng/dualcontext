import type { Texts } from "../../../../../../../i18n";
import type { NodeDoc } from "../../../use-node-detail";
import { RSC } from "./resource";

/**
 * 노드 상세 문서의 읽기 상태 한 줄. 문서가 없는 것은 오류가 아니다(옛 실행 · 아직 안 만들어짐): 계획 기록만으로 보이는 것은 그대로 보이고
 * 프롬프트 · 라우팅 같은 상세만 없다. 진행 중인 실행에서 문서가 아직 없으면 만들어지는 대로 채워진다고 알린다.
 */
export function DocStatus({ doc, running, t }: { doc: NodeDoc; running: boolean; t: Texts }) {
  if (doc.status === "loading") return <p role="status" data-testid="run-node-doc-loading" className="text-xs text-muted">{t[RSC.RUNS_DOC_LOADING_STATUS]}</p>;
  if (doc.status === "failed") return <p role="alert" data-testid="run-node-doc-failed" className="text-xs text-danger">{t[RSC.RUNS_DOC_FAILED_ALERT]}</p>;
  if (doc.status === "missing") {
    return <p role="status" data-testid="run-node-doc-missing" className="text-xs text-muted">{running ? t[RSC.RUNS_DOC_GROWING_MESSAGE] : t[RSC.RUNS_DOC_MISSING_MESSAGE]}</p>;
  }
  return null;
}
