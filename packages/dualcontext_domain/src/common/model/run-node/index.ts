import type { AugmentPair, AugmentResult, RoutingTrace } from "../index.js";

/**
 * 실행 로그 그래프의 노드 상세. 무거운 내용(프롬프트 · 응답 · 조사원 자료 · 라우팅)은 실행 행이나 계획 trace 에 넣지 않고
 * 노드마다 따로 저장해(테이블 augment_run_nodes, 키 = 아래 키 규칙) 노드를 고를 때 읽는다.
 *
 * 노드 키 규칙(runNodeKey):
 * - `classic`        classic 모드의 증강 한 번(조사원 라우팅 → 수집 → 프로시저 → 라이터)
 * - `analyze`        질의 분해(질의 분석 호출 + 처음 후보 중복 정리)
 * - `item:<id>`      컨텍스트 아이템(PlanItem.id). 사전 요구 분석 호출과 컨텍스트 생성이 한 문서에 합쳐진다
 * - `dedupe:<round>:<level|seed>`  중복 정리 모델 호출(dedupe=llm 일 때만 있다). level 이 없는 것은 top 후보 정리(seed)
 * - `answer:before` · `answer:after`  최종 답변 두 개(증강 전 · 후)를 만든 호출
 * - `answer:<round>` · `evaluate:<round>`  재평가 루프의 라운드별 답변 · 평가 호출
 */
export const runNodeKey = {
  classic: "classic",
  analyze: "analyze",
  item: (id: string) => `item:${id}`,
  dedupe: (round: number, level?: number) => `dedupe:${round}:${level ?? "seed"}`,
  finalAnswer: (which: "before" | "after") => `answer:${which}`,
  answer: (round: number) => `answer:${round}`,
  evaluate: (round: number) => `evaluate:${round}`
} as const;

/** 모델 호출 한 건. 프롬프트는 템플릿이 아니라 실제로 보낸 글이다(값이 채워진 것). */
export type LlmCall = {
  /** 노드 안에서 호출 순서(1부터). */
  seq: number;
  /** 무슨 호출인지 아는 경우(어댑터가 붙인다): analyze · prerequisites · dedupe · answer · evaluate. 라우터 · 프로시저 · 라이터 호출은 비어 있다. */
  purpose?: "analyze" | "prerequisites" | "dedupe" | "answer" | "evaluate";
  prompt: string;
  /** 응답 본문. 실패하면 null. */
  response: string | null;
  error?: string;
  /** 소요 ms(요청 시작 ~ 응답 완료). */
  ms: number;
  /** 시작 시각(ISO). */
  at: string;
  /** 프롬프트 · 응답이 길어 잘렸는가(잘린 글자 수는 본문 끝의 표식에 있다). */
  truncated?: boolean;
};

/** 아이템이 사전 컨텍스트로 건네받은 것. chars = 원문 길이, sent = 실제로 라이터에 넘긴 글자 수(maxProvidedChars 로 자른 뒤). */
export type NodeProvided = { item: string; name: string; chars: number; sent: number; text: string };

/** 노드 상세 한 건. 있는 필드만 채운다(노드 종류마다 다르다). */
export type RunNodeDetail = {
  key: string;
  /** 이 노드를 만드는 동안 부른 모델 호출들(시간순). item 노드는 컨텍스트 생성 호출(라우팅 · 프로시저 · 라이터 …)이다. */
  calls: LlmCall[];
  /** item 노드: 사전 요구 분석 호출(컨텍스트 생성 호출과 구분). */
  prerequisitesCalls?: LlmCall[];
  /** item 노드: 건네받은 사전 컨텍스트. */
  provided?: NodeProvided[];
  /** item 노드: 이 아이템의 증강 결과(라우팅 기록 · 쌍과 자료 · 컨텍스트). classic 은 실행 행(routing · pairs · context)에 이미 있어 여기엔 없다. */
  augment?: { routing: RoutingTrace; pairs: AugmentPair[]; context: string; researcherRouting: string; writer: AugmentResult["writer"] };
  /** 노드를 만들다 모델 호출이 아닌 곳에서 난 오류(조사원 수집 · DB 등). 모델 호출 오류는 calls[].error 에 있다. */
  error?: string;
  /** 마지막으로 쓴 시각(ISO). */
  at: string;
};

/** 노드 상세에 담는 글(프롬프트 · 응답)의 최대 길이. 넘으면 앞부분만 두고 truncated 를 켠다. */
export const NODE_TEXT_LIMIT = 60_000;
