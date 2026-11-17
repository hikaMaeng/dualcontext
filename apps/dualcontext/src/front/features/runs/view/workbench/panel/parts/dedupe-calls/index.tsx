import { runNodeKey } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../../i18n";
import type { RunDetail } from "../../../../../../../lib/run";
import { useNodeDetail } from "../../../use-node-detail";
import { CallList } from "../calls";

/** 중복 정리(dedupe=llm)가 모델을 부른 기록. 그 키의 문서가 저장돼 있을 때만 읽고 보이며, 이름 정규화만 쓴 정리에는 없다. */
export function DedupeCalls({ run, round, level, title, t }: { run: RunDetail; round: number; level?: number; title: string; t: Texts }) {
  const key = runNodeKey.dedupe(round, level);
  const stored = (run.nodes ?? []).includes(key);
  const { doc } = useNodeDetail(run.id, key, { running: false, stored, enabled: stored });
  if (!stored || !doc || doc.calls.length === 0) return null;
  return <CallList calls={doc.calls} testId={`run-node-${key}-calls`} title={title} t={t} />;
}
