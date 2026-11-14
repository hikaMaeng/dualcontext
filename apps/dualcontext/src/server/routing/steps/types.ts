import type { ScoredId } from "dualcontext_domain/server";

/** 단계가 쓰는 바깥 세계. 후보 종류(조사원, 프로시저)마다 파이프라인 호출자가 채운다. */
export type StepEnv<T extends { id: number }> = {
  query: string;
  /** 질의 임베딩. 한 번 계산하고 이후 단계는 같은 값을 받는다. */
  embedQuery: () => Promise<number[]>;
  /** 후보 글의 임베딩(DB 에 캐시). */
  vectorsOf: (items: T[]) => Promise<number[][]>;
  chat: (prompt: string) => Promise<string>;
  /** LLM 후보 목록에 한 줄로 보일 글. score 가 있으면 앞 임베딩 단계의 유사도다. */
  line: (item: T, score?: number) => string;
  keywordTopK: (items: T[], topK: number) => T[];
  /** 앞 임베딩 단계가 매긴 점수(후보 id → 코사인). */
  scores: Map<number, number>;
};

/** 단계 하나의 결과: 남긴 후보(단계가 정한 순서), 임베딩 단계가 매긴 점수, 메모. */
export type StepResult<T> = { items: T[]; scores?: ScoredId[]; note?: string };
