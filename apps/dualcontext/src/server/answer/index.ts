import type { Answer, Answers } from "dualcontext_domain/common";
import type { ModelClient } from "../model/index.js";

/**
 * 최종 답변 프롬프트. 증강의 효과를 보려면 두 답변이 같은 모델 · 같은 조건이어야 하므로
 * 차이는 컨텍스트의 유무뿐이다. 이 문장 그대로가 실행 로그의 설정 스냅샷에 남는다.
 */
export const answerPrompts = {
  before: `다음 질문에 답하라.

질문: {{query}}`,
  after: `아래 컨텍스트는 질문에 답하기 위해 조사원들이 모은 근거와 사람이 정한 분석 기준이다.
컨텍스트를 근거로 질문에 답하라. 컨텍스트에 없는 내용은 추측하지 말고 부족하다고 밝혀라.
근거를 쓸 때는 출처를 표시하라.

[컨텍스트]
{{context}}

질문: {{query}}`
};

const fill = (template: string, values: Record<string, string>) => template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => values[key] ?? "");

async function ask(model: ModelClient, prompt: string): Promise<Answer> {
  const started = Date.now();
  try {
    return { text: await model.chat(prompt), error: null, ms: Date.now() - started };
  } catch (error) {
    return { text: null, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
  }
}

/** 증강 전후 답변을 병렬로 만든다. 한쪽이 실패해도 다른 쪽과 실행 전체는 살린다. */
export async function generateAnswers(model: ModelClient, query: string, context: string): Promise<Answers> {
  const [before, after] = await Promise.all([
    ask(model, fill(answerPrompts.before, { query })),
    ask(model, fill(answerPrompts.after, { query, context }))
  ]);
  return { before, after };
}
