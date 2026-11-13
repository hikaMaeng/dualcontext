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

/**
 * 증강 전후 답변을 병렬로 만든다. 한쪽이 실패해도 다른 쪽과 실행 전체는 살린다.
 * onAnswer 는 답변 하나가 끝나는 즉시 불린다(비동기 실행이 진행 상황을 기록하는 자리).
 */
export async function generateAnswers(
  model: ModelClient,
  query: string,
  context: string,
  onAnswer?: (which: keyof Answers, answer: Answer) => Promise<void> | void
): Promise<Answers> {
  // 마땅한 조사원이 없어 컨텍스트가 비면 증강 후 답변은 증강 전 답변과 같은 입력이다. 모델을 한 번 더 부르지 않는다.
  const skipAfter = context.trim() === "";
  const record = async (which: keyof Answers, answer: Answer) => {
    // 진행 기록이 실패해도(DB 순간 장애 등) 답변 자체는 잃지 않는다.
    await Promise.resolve(onAnswer?.(which, answer)).catch(() => undefined);
    return answer;
  };
  const [before, after] = await Promise.all([
    ask(model, fill(answerPrompts.before, { query })).then((answer) => record("before", answer)),
    (skipAfter
      ? Promise.resolve<Answer>({ text: null, error: null, ms: 0, skipped: true })
      : ask(model, fill(answerPrompts.after, { query, context }))
    ).then((answer) => record("after", answer))
  ]);
  return { before, after };
}
