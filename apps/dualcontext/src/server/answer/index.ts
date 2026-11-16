import type { Answer, Answers } from "dualcontext_domain/common";
import type { ModelClient } from "../model/index.js";

/**
 * 최종 답변 프롬프트. 증강의 효과를 보려면 두 답변이 같은 모델 · 같은 조건이어야 하므로
 * 차이는 컨텍스트의 유무뿐이다. 컨텍스트는 근거가 아니라 참고 자료로 건넨다:
 * 「컨텍스트에 없는 내용은 추측하지 말라」고 했을 때 무관한 자료가 붙은 질의에서 모델이 아는 답까지 거절했다(실행 로그 #16 · #27 · #29). 이 문장 그대로가 실행 로그의 설정 스냅샷에 남는다.
 */
export const answerPrompts = {
  before: `다음 질문에 답하라.

질문: {{query}}`,
  after: `아래 참고 자료는 질문과 관련될 수 있어 조사원들이 모은 것이다. 도움이 되는 부분만 골라 쓰고, 질문과 관련 없는 자료는 무시하라.
자료에 없는 내용도 네가 아는 지식으로 충분히 답하라. 자료가 부족하다는 이유로 답을 줄이거나 거절하지 마라.
자료에서 가져온 사실에는 [R12-1] 같은 출처 번호를 붙이고, 네 일반 지식에는 출처 번호를 붙이지 마라. 자료에 없는 출처 이름이나 URL은 만들지 마라.
자료와 네 지식이 어긋나면 둘 다 밝히고 어느 쪽이 더 믿을 만한지 적어라.

[참고 자료]
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
 * preparedAfter 는 이미 같은 프롬프트(after) · 같은 컨텍스트로 만든 답변이다(reevaluate 계획의 마지막 라운드). 주면 모델을 다시 부르지 않고 그대로 기록한다.
 */
export async function generateAnswers(
  model: ModelClient,
  query: string,
  context: string,
  onAnswer?: (which: keyof Answers, answer: Answer) => Promise<void> | void,
  preparedAfter?: Answer
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
      : preparedAfter
        ? Promise.resolve<Answer>(preparedAfter)
        : ask(model, fill(answerPrompts.after, { query, context }))
    ).then((answer) => record("after", answer))
  ]);
  return { before, after };
}
