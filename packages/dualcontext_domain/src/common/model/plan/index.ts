/**
 * 컨텍스트 계획(의존성 트리) 계약. 도메인 플래너, 앱 어댑터, 관리자 API, 프런트가 같은 모양을 쓴다.
 *
 * 모드
 * - classic     기존 경로 그대로(계획 없음).
 * - decompose   질의를 컨텍스트 아이템으로 분해하고 의존성을 분석해 종단점부터 역으로 컨텍스트를 만든다.
 * - reevaluate  decompose 에 더해 답변을 만들고 평가해 부족하면 아이템을 보강하는 루프를 돈다.
 */
export type ContextMode = "classic" | "decompose" | "reevaluate";

/** 계획 설정. DB 에 한 행(jsonb)으로 저장하고 실행 로그 스냅샷에 남는다. */
export type ContextPlanConfig = {
  mode: ContextMode;
  /** 아이템 목록의 최대 단계 수(1차 + 의존성 분석으로 늘어나는 단계). 1 이면 의존성 분석을 하지 않는다. 1~6. */
  maxLevels: number;
  /** 한 번의 분석에서 아이템 하나가 낼 수 있는 사전 아이템 수 상한. 1~8. */
  maxNeedsPerItem: number;
  /** 최초 계획의 아이템 수 상한(넘으면 더 만들지 않는다). 재평가 보강은 라운드마다 별도 예산 maxNewItems*(1+maxNeedsPerItem)를 쓴다. 1~40. */
  maxItems: number;
  /** 사전 컨텍스트 하나를 의존하는 아이템에 건넬 때 반영하는 최대 글자 수(넘으면 앞부분만). 깊은 의존성이 컨텍스트를 부풀리는 것을 막는다. 500~20000. */
  maxProvidedChars: number;
  /** 중복 정리 방법: name = 정규화한 이름이 같으면 합침, llm = 모델이 같은 것을 묶고 기존 아이템과도 대조(실패하면 name). */
  dedupe: "name" | "llm";
  /** 재평가 설정(reevaluate 모드에서만 쓴다). */
  reevaluate: {
    /** 답변 보강 반복 상한(최초 답변 이후 추가 라운드 수). 0~5. */
    maxRounds: number;
    /** 통과 점수(0~100). 평가 점수가 이 값 이상이어야 통과. */
    passScore: number;
    /** 통과로 인정하는 부족 컨텍스트 개수 상한. 0 이면 부족 항목이 하나도 없어야 통과. */
    maxMissing: number;
    /** 한 라운드에서 보강으로 추가할 아이템 수 상한. 1~8. */
    maxNewItems: number;
  };
  /** 단계별 프롬프트. {{...}} 자리표시자는 앱 어댑터가 채운다(프롬프트마다 달라 prompts 모듈이 정의한다). */
  prompts: { analyze: string; prerequisites: string; dedupe: string; evaluate: string };
};

/** 아이템 초안(이름 + 자기완결적 설명). 분석 · 보강 · 사전 요구 분석이 모두 이 모양을 낸다. */
export type ItemDraft = { name: string; description: string };

/** 컨텍스트 아이템 상태. built=컨텍스트 있음, empty=조사원이 없거나 자료가 없어 비었음, error=생성 실패, pending=아직. */
export type ItemStatus = "pending" | "built" | "empty" | "error";

/** 의존성 그래프의 노드. 사전 아이템끼리 중복이 정리되므로 실제 구조는 DAG 다. */
export type PlanItem = {
  /** 안정적인 id(i1, i2 …). 계획 안에서만 유일하다. */
  id: string;
  name: string;
  description: string;
  /** 처음 발견된 단계(1=질의 분석, 2=1차의 사전 요구 …). 보강 아이템은 1 이다. */
  level: number;
  /** 최종 컨텍스트에 실리는 아이템인가(질의 분석 · 보강으로 나온 것). 사전 아이템은 의존하는 쪽 컨텍스트에 녹는다. */
  top: boolean;
  /** 이 아이템보다 먼저 컨텍스트가 만들어져 제공돼야 하는 아이템 id 들. */
  needs: string[];
  /** 만들어진 시점: 0=처음 계획, n=재평가 n번째 라운드의 보강. */
  round: number;
  status: ItemStatus;
  /** 이 아이템을 위해 만든 컨텍스트(사전 컨텍스트를 반영한 것). */
  context: string;
  error?: string;
  /** 소요 ms. */
  ms?: number;
  /** 이 아이템이 쓴 조사원 · 프로시저 쌍 요약(실행 로그의 조사원 탭과 같은 모양). */
  pairs: { researcher: string; procedure: string | null; materialCount: number; error?: string; procedureRouting: string }[];
};

/** 답변 평가 결과. */
export type PlanEvaluation = {
  /** 0~100. */
  score: number;
  /** 질의에 답하기 위해 더 있어야 하는 컨텍스트. */
  missing: (ItemDraft & { reason?: string })[];
  /** 평가 모델의 한 줄 판단. */
  reason: string;
  /** 통과조건(점수 · 부족 개수)을 만족했는가. */
  pass: boolean;
};

/** 재평가 라운드 하나의 기록. round 0 은 처음 컨텍스트로 만든 답변이다. */
export type PlanRound = {
  round: number;
  /** 이 라운드에서 답변을 만들 때 쓴 컨텍스트 길이(문자). */
  contextChars: number;
  answer: { text: string | null; error: string | null; ms: number };
  evaluation: PlanEvaluation | null;
  evaluationError?: string;
  /** 이 라운드의 평가가 요구해 새로 만든 아이템 id(중복으로 흡수된 것은 빠진다). */
  addedItemIds: string[];
};

/** 계획이 멈춘 이유. */
export type PlanStop =
  | "mode-decompose" // decompose 모드: 컨텍스트만 만들고 끝
  | "passed" // 평가 통과
  | "max-rounds" // 보강 라운드 상한
  | "no-missing" // 불통과인데 평가가 요구한 것이 없다
  | "no-new-items" // 요구한 것이 모두 이미 컨텍스트가 있는 top 아이템이라 보강할 것이 없다
  | "no-items" // 질의에서 아이템이 나오지 않았다(빈 컨텍스트)
  | "evaluation-failed" // 평가 호출 실패(응답 형식 오류 포함)
  | "answer-failed"; // 답변 생성 실패

/** 계획 실행 결과(실행 로그 plan 열에 그대로 저장한다). */
export type PlanTrace = {
  mode: Exclude<ContextMode, "classic">;
  /** 실행에 쓴 설정(프롬프트 제외 — 스냅샷에는 별도로 남는다). */
  limits: Pick<ContextPlanConfig, "maxLevels" | "maxNeedsPerItem" | "maxItems" | "maxProvidedChars" | "dedupe" | "reevaluate">;
  items: PlanItem[];
  /** 의존성 분석 단계별 로그: 단계 n 에서 찾은 후보 수, 중복 정리 뒤 새 아이템 수. */
  levels: {
    level: number;
    analyzed: number;
    candidates: number;
    created: number;
    linked: number;
    /** 이 단계에서 사전 요구 분석 호출이 실패한 아이템(item 은 PlanItem.id, 그 아이템은 사전 요구가 없는 것으로 진행했다). */
    failed?: { item: string; error: string }[];
  }[];
  /** 컨텍스트 생성 순서(같은 묶음은 병렬): 아이템 id 배열의 배열. */
  waves: string[][];
  rounds: PlanRound[];
  stop: PlanStop;
  /** 마지막 답변(reevaluate 모드에서만). */
  answer?: string;
  ms: number;
};
