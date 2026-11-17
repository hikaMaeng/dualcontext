import type { PlanStep } from "dualcontext_domain/common";

/** 진행 기록의 단계 묶음 종류. 같은 라운드에서 이어지는 같은 종류(및 같은 단계 · 웨이브)의 기록을 한 묶음으로 본다. */
export type PhaseKind = "analyze" | "seed" | "dependencies" | "build" | "assemble" | "answer" | "evaluate";

export type StepPhase = {
  /** 묶음의 위치 키(순번:종류). 같은 종류가 여러 번 나와도 유일하다. */
  key: string;
  round: number;
  kind: PhaseKind;
  /** dependencies 묶음의 단계(2부터). */
  level?: number;
  /** build 묶음의 웨이브(1부터, 라운드 안에서). */
  wave?: number;
  steps: PlanStep[];
  /** 묶음이 시작한 시각(계획 시작 후 ms) — 가장 먼저 시작한 기록의 at - ms. */
  startMs: number;
  /** 묶음이 끝난 시각 — 가장 늦은 기록의 at. */
  endMs: number;
};

function placeOf(step: PlanStep): { kind: PhaseKind; level?: number; wave?: number } {
  switch (step.kind) {
    case "prerequisites":
    case "dedupe":
      return { kind: "dependencies", level: step.level };
    case "build":
      return { kind: "build", wave: step.wave };
    default:
      return { kind: step.kind };
  }
}

/**
 * 시간순 단계 기록을 묶음으로 나눈다. 라운드 · 종류 · 단계(level) · 웨이브가 같은 연속 기록이 한 묶음이다.
 * 사전 요구 분석과 중복 정리는 같은 단계라 한 묶음(분석이 병렬로 끝난 뒤 정리가 온다), 같은 웨이브의 build 는 병렬이라 한 묶음이다.
 * 순서가 어긋난 입력(seq 가 앞서지 않는 것)은 seq 로 다시 세운다.
 */
export function groupSteps(steps: PlanStep[]): StepPhase[] {
  const phases: StepPhase[] = [];
  for (const step of [...steps].sort((a, b) => a.seq - b.seq)) {
    const place = placeOf(step);
    const last = phases.at(-1);
    const started = Math.max(0, step.at - step.ms);
    if (last && last.round === step.round && last.kind === place.kind && last.level === place.level && last.wave === place.wave) {
      last.steps.push(step);
      last.startMs = Math.min(last.startMs, started);
      last.endMs = Math.max(last.endMs, step.at);
      continue;
    }
    phases.push({ key: `${phases.length}:${place.kind}`, round: step.round, ...place, steps: [step], startMs: started, endMs: step.at });
  }
  return phases;
}

/** 묶음의 걸린 시간(ms): 병렬 기록은 합이 아니라 처음 시작부터 마지막 끝까지다. */
export function phaseMs(phase: Pick<StepPhase, "startMs" | "endMs">): number {
  return Math.max(0, phase.endMs - phase.startMs);
}

/** 막대 길이용 비율(0~1): 묶음 시간 / 전체 시간. 전체가 0 이면 0. */
export function phaseShare(phase: Pick<StepPhase, "startMs" | "endMs">, totalMs: number): number {
  return totalMs > 0 ? Math.min(1, phaseMs(phase) / totalMs) : 0;
}

/** 후보 번호 묶음(dedupe 의 members)을 이름 목록으로. 범위를 벗어난 번호는 건너뛴다. */
export function memberNames(candidates: { name: string }[], members: number[]): string[] {
  return members.flatMap((index) => (candidates[index] ? [candidates[index].name] : []));
}
