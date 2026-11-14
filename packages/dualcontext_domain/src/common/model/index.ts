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
  /** 임베딩 방식에서 이 유사도(코사인, 0~1)보다 낮은 후보는 상위 N 안이어도 제외한다. 0 이면 거르지 않는다. */
  researcherMinScore: number;
  researcherPrompt: string;
  procedureMethod: RoutingMethod;
  procedureTopK: number;
  procedureMinScore: number;
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

/** 라우팅이 후보 하나에 매긴 점수와 선택 여부(임베딩 방식에서만 점수가 있다). */
export type RoutingScore = { name: string; score: number; selected: boolean };

/** 조사원이 출처에서 모은 원재료 한 조각. */
export type Material = {
  title: string;
  text: string;
  /** 질의와 이 자료의 코사인 유사도(벡터 조사원만). 웹 검색 같은 출처는 점수가 없다. */
  score?: number;
  /** 질의 속 표기(CVE ID, 모델명, 문서 번호)와 문자열로 일치해 가져온 자료. 유사도 점수 대신 이 표시가 붙는다. */
  match?: "identifier";
};

/** 라이터 입력 한 쌍: 조사원이 모은 정보와 그 정보에 묶인 프로시저. */
export type Pair = {
  researcher: Researcher;
  procedure: Procedure | null;
  materials: Material[];
  /** 수집이 실패했다면 그 이유. 라이터가 부족한 항목으로 표시한다. */
  error?: string;
};

/** LLM 이 만든 최종 답변 하나. 실패하면 text 가 null 이고 error 에 이유가 있다. */
export type Answer = {
  text: string | null;
  error: string | null;
  ms: number;
  /** 증강 후 답변을 만들지 않았다(컨텍스트가 없어 증강 전 답변과 같다). */
  skipped?: boolean;
};

/** 컨텍스트 증강 전(질의만)과 후(질의 + 증강된 컨텍스트)의 최종 답변. */
export type Answers = { before: Answer; after: Answer };

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

/** 라우팅 판단의 근거. 조사원 후보 점수와, 선택된 조사원마다의 프로시저 후보 점수. */
export type RoutingTrace = {
  researchers: RoutingScore[];
  procedures: { researcher: string; candidates: RoutingScore[] }[];
};

export type AugmentResult = {
  /** 비어 있으면 마땅한 조사원이 없어 컨텍스트를 공급하지 않았다는 뜻이다. */
  context: string;
  routing: RoutingTrace;
  /** 조사원 라우팅이 실제로 쓴 방법. 되돌림이 일어났다면 그 사실이 들어 있다. */
  researcherRouting: string;
  pairs: AugmentPair[];
  writer: { mode: WriterMode; calls: number };
};

export const serviceDomain = Object.freeze({
  service: "dualcontext",
  packageName: "dualcontext_domain"
});
