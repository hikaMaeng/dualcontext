export type ResearcherType = "duckduckgo" | "pgvector" | "folder";

/**
 * 조사원: 출처마다 하나. 원재료를 모을 뿐 해석하지 않는다.
 * 코드 식별자는 researcher 를 유지하고, 사용자에게 보이는 정식 명칭만 「조사원」이다.
 */
export type Researcher = {
  id: number;
  name: string;
  description: string;
  /** 키워드 라우팅 신호. 임베딩/LLM 라우팅이 불가능할 때의 되돌림 경로이기도 하다. */
  keywords: string[];
  enabled: boolean;
  type: ResearcherType;
  /** 타입별 설정. duckduckgo {topK}, pgvector {table,vectorColumn,textColumn,titleColumn,topK}, folder {path,topK}. */
  config: Record<string, unknown>;
  /** 이 조사원에 연결된 프로시저 id(연결 순서). 연결은 조사원이 소유한다. */
  procedureIds: number[];
};

/** 프로시저: 사람이 써 둔 분석·평가 순서와 임팩트 기준. 어느 조사원에도 속하지 않고 독립적으로 존재한다. */
export type Procedure = {
  id: number;
  name: string;
  /** 키워드 라우팅 신호. 비어 있으면 키워드 라우팅에서 항상 후보다. */
  appliesWhen: string[];
  steps: string[];
  impacts: string[];
  outputFormat: string;
  enabled: boolean;
};

export type RoutingMethod = "keyword" | "embedding" | "llm";

/** 라우터 설정. 1단계는 조사원, 2단계는 선택된 조사원에 연결된 프로시저를 고른다. */
export type RouterConfig = {
  researcherMethod: RoutingMethod;
  researcherTopK: number;
  researcherPrompt: string;
  procedureMethod: RoutingMethod;
  procedureTopK: number;
  procedurePrompt: string;
};

export type WriterEngine = "template" | "llm";
/** batch: 라이터 한 번에 모든 쌍을 준다. per_pair: 쌍마다 한 번씩 호출하고 결과를 이어 붙인다. */
export type WriterMode = "batch" | "per_pair";

export type WriterConfig = {
  id: number;
  name: string;
  engine: WriterEngine;
  mode: WriterMode;
  prompt: string;
  active: boolean;
};

/** 조사원이 출처에서 모은 원재료 한 조각. */
export type Material = {
  title: string;
  text: string;
};

/** 라이터 입력 한 쌍: 조사원이 모은 정보와 그 정보에 묶인 프로시저. */
export type Pair = {
  researcher: Researcher;
  procedure: Procedure | null;
  materials: Material[];
  /** 수집이 실패했다면 그 이유. 라이터가 부족한 항목으로 표시한다. */
  error?: string;
};

/** 증강 결과에 담기는, 선택된 (조사원, 프로시저) 쌍의 요약. */
export type AugmentPair = {
  researcher: string;
  procedure: string | null;
  materialCount: number;
  /** 이 쌍에 실린 수집 자료(실행 로그 상세용). */
  materials: Material[];
  /** 수집이 실패했다면 그 이유. */
  error?: string;
  procedureRouting: string;
};

export type AugmentResult = {
  context: string;
  /** 조사원 라우팅이 실제로 쓴 방법. 되돌림이 일어났다면 그 사실이 들어 있다. */
  researcherRouting: string;
  pairs: AugmentPair[];
  writer: { mode: WriterMode; calls: number };
};

export const serviceDomain = Object.freeze({
  service: "dualcontext",
  packageName: "dualcontext_domain"
});
