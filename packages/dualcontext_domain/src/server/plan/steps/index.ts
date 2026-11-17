import type { PlanStep } from "../../../common/index.js";

/** 기록할 단계: seq · at 은 기록기가 채운다. 유니온의 각 모양을 그대로 유지한다. */
export type StepInput = PlanStep extends infer S ? (S extends PlanStep ? Omit<S, "seq" | "at"> : never) : never;

/**
 * 계획이 밟은 단계의 시간순 기록기. 키: seq(1부터 늘어난다). 범위 · 수명: planContext 호출 한 번. 상한: 단계 수는 아이템 · 라운드 수에 비례해
 * 유한하다(아이템당 build · 사전 요구 1건 + 단계 · 라운드당 소수). 지우는 쪽: 없음(호출이 끝나면 trace.steps 로 넘어가고 버려진다).
 * add 마다 onChange 를 부른다(실행 로그가 부분 trace 를 저장하게). onChange 실패는 계획을 멈추지 않는다.
 * see docs/plan.md#steps
 */
export type StepRecorder = {
  steps: PlanStep[];
  /** 지금까지 걸린 ms(계획 시작 기준). */
  elapsed: () => number;
  add: (step: StepInput) => void;
};

export function createRecorder(now: () => number, started: number, onChange?: () => void): StepRecorder {
  const steps: PlanStep[] = [];
  return {
    steps,
    elapsed: () => now() - started,
    add(step) {
      steps.push({ ...step, seq: steps.length + 1, at: now() - started } as PlanStep);
      try {
        onChange?.();
      } catch {
        // 부분 trace 알림 실패는 계획을 멈추지 않는다.
      }
    }
  };
}
