import { AnswerCompare } from "../../../../../components/answers";
import type { PanelProps } from "../types";
import { RSC } from "./resource";

/** 답변 탭: 증강 전 · 후 최종 답변 비교. 끝나는 대로 하나씩 채워지고, 아직 없는 쪽은 「만드는 중」을 보인다. */
export function AnswerPanel({ detail, phase, t }: PanelProps) {
  if (!detail.answers && !phase.running) {
    return <p role="status" data-testid="run-answer-empty" className="text-sm text-muted">{t[RSC.RUNS_ANSWER_EMPTY_MESSAGE]}</p>;
  }
  return <AnswerCompare answers={detail.answers} pending={phase.running && phase.augmentDone} t={t} />;
}
