import type { ContextPlanConfig, ItemDraft, PlanEvaluation, PlanItem, PlanTrace } from "../../common/index.js";

/** 아이템 컨텍스트 생성 결과. context 가 빈 문자열이면 조사원이 없거나 자료가 없어 비었다는 뜻이다. */
export type ItemBuild = {
  context: string;
  pairs: PlanItem["pairs"];
};

/** 사전 아이템이 이미 만든 컨텍스트. 의존하는 아이템의 컨텍스트를 만들 때 함께 제공된다. */
export type Provided = { name: string; context: string };

/**
 * 포트 호출이 계획의 어디에서 일어났는지(실행 로그가 호출의 프롬프트 · 응답을 노드에 붙이는 데 쓴다. 플래너의 동작에는 영향이 없다).
 * round = 0 처음 계획, n = 재평가 n번째 보강. item = 대상 아이템 id(prerequisites · build). level = 사전 요구 분석 단계(dedupe, 질의 분석 결과 정리는 없다).
 */
export type PlanCallRef = {
  round: number;
  item?: string;
  level?: number;
  /** build 만: provided 인자의 각 항목이 어느 아이템(id)의 컨텍스트인지(같은 순서). */
  provided?: string[];
};

/** 바깥 세계(모델 · 기존 증강 경로)와의 경계. 앱이 채운다. 플래너는 순수하다. 마지막 인자 ref 는 호출 위치다(없어도 된다). */
export type PlanPorts = {
  /** 1. 질의가 필요로 하는 핵심 컨텍스트 아이템을 뽑는다. */
  analyze: (query: string, ref?: PlanCallRef) => Promise<ItemDraft[]>;
  /** 3. 아이템 하나가 먼저 제공받아야 하는 사전 컨텍스트. known 은 지금까지 나온 모든 아이템(이름 재사용용). */
  prerequisites: (query: string, item: ItemDraft, known: ItemDraft[], ref?: PlanCallRef) => Promise<ItemDraft[]>;
  /**
   * 4. 중복 정리(dedupe 가 llm 일 때만 부른다). candidates 마다 번호를 매겨 돌려준다:
   * `groups` 는 같은 것끼리 묶은 candidates 인덱스 배열들(묶이지 않은 것은 생략 가능), `existing` 은 candidates 인덱스 → 기존 아이템 id.
   * 실패하면 던진다(플래너가 이름 정규화로 되돌아간다).
   */
  dedupe: (query: string, candidates: ItemDraft[], existing: { id: string; name: string; description: string }[], ref?: PlanCallRef) => Promise<{ groups: number[][]; existing: Record<number, string> }>;
  /** 9. 아이템 하나의 컨텍스트를 기존 경로(조사원 · 프로시저 · 라이터)로 만든다. 사전 컨텍스트를 함께 받는다. */
  build: (query: string, item: ItemDraft, provided: Provided[], ref?: PlanCallRef) => Promise<ItemBuild>;
  /** 11. 질의와 컨텍스트로 답변을 만든다(reevaluate 에서만). */
  answer: (query: string, context: string, ref?: PlanCallRef) => Promise<string>;
  /** 12. 질의 · 컨텍스트 · 답변을 보고 평가한다(reevaluate 에서만). pass 는 플래너가 설정으로 다시 계산하므로 채우지 않아도 된다. */
  evaluate: (query: string, context: string, answer: string, ref?: PlanCallRef) => Promise<Omit<PlanEvaluation, "pass">>;
};

export type PlanOptions = {
  config: ContextPlanConfig;
  ports: PlanPorts;
  now?: () => number;
  /**
   * 실행 취소 신호. 레벨 · 웨이브 · 라운드 경계에서 확인하고, abort 되면 RunAborted 를 던진다. 사유가 deadline 이고 조립된 컨텍스트가
   * 있으면 던지는 대신 부분 결과(stop = "deadline")를 돌려준다.
   */
  signal?: AbortSignal;
  onProgress?: (event: PlanProgress) => Promise<void> | void;
  /**
   * 단계 기록이 늘 때마다(그리고 진행 알림마다) 그 시점의 부분 trace(stop=null)를 건넨다. 값은 계획이 계속 고치는 객체를 가리키므로
   * 받는 쪽은 호출 안에서 바로 직렬화해야 한다(나중에 읽으면 더 진행된 상태가 보인다). 던져도 계획은 멈추지 않는다.
   */
  onTrace?: (trace: PlanTrace) => void;
};

/** 진행 알림(실행 로그가 단계별로 기록한다). trace 는 그 시점의 부분 결과다. */
export type PlanProgress = { stage: "analyze" | "dependencies" | "build" | "answer" | "evaluate" | "reinforce" | "done"; detail?: string };
