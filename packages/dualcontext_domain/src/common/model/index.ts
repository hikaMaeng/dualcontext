export type ResearcherType = "duckduckgo" | "pgvector" | "folder" | "codebase" | "crawler";

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
  /** 타입별 설정. duckduckgo {topK}, pgvector {table,vectorColumn,textColumn,titleColumn,topK}, folder {path,topK}, codebase {source,url,ref,subPath,path,...}, crawler {startUrls,allowedDomains,depth,maxPages,delayMs,refreshHours,topK 등(server/collect/crawler/config)}. */
  config: Record<string, unknown>;
  /** 이 조사원에 연결된 프로시저 id(연결 순서). 연결은 조사원이 소유한다. */
  procedureIds: number[];
  /**
   * 기본 프로시저 id. 프로시저 라우팅이 하나도 고르지 못했을 때 대신 붙는다(폴백). null 이면 없다(기본값).
   * 이 조사원에 연결된(procedureIds) 프로시저여야 한다. 프로시저가 삭제되면 DB 가 null 로 되돌린다.
   */
  defaultProcedureId: number | null;
  /**
   * 개별 라우터. 없으면(null) 전역 라우터가 고른다. 있으면 이 조사원은 전역 라우터의 후보 목록에서 빠지고,
   * 이 단계(stage) 파이프라인이 「이 조사원 하나를 쓸지」만 따로 판정한다(남으면 포함, 비면 제외). 포함된 뒤에는 전역 선택과 같은 경로(수집 → 프로시저 매칭)로 합류한다.
   */
  router?: StageConfig | null;
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

/** 단계가 실패했을 때(모델 서버 오류, 답 해석 실패): skip 은 이 단계를 건너뛰고 이어간다, keyword 는 이 단계의 입력 후보로 키워드 라우팅을 하고 이어간다, none 은 아무것도 고르지 않고 끝낸다. */
export type StepOnError = "skip" | "keyword" | "none";

type StepBase = {
  /** 복합 질의의 하위 질문에도 이 단계를 적용한다. 비싼 단계(LLM)는 통째 질의에만 쓰도록 끌 수 있다. */
  parts: boolean;
  onError: StepOnError;
};

/**
 * 라우팅 단계 하나. 단계는 앞 단계가 남긴 후보를 받아 더 좁힌다(필터). 후보 전체에서 시작해 마지막 단계가 남긴 것이 선택이다.
 * - embedding: 질의와 후보 글의 코사인 유사도. minScore 미만, 최고 점수에서 margin 넘게 뒤처진 후보, 상위 topK 밖은 제외한다.
 * - keyword: 후보의 키워드가 질의에 들어 있는 정도로 상위 topK 를 고른다(맞는 것이 없으면 비운다).
 * - llm: 후보 목록을 LLM 에 주고 고르게 한다. allowNone 이면 「없음」을 답할 수 있다(없으면 빈 답은 무시하고 입력을 유지한다).
 */
export type RouterStep =
  | (StepBase & { type: "embedding"; topK: number; minScore: number; margin: number })
  | (StepBase & { type: "keyword"; topK: number })
  | (StepBase & { type: "llm"; topK: number; prompt: string; showScores: boolean; allowNone: boolean });

export type StageConfig = { steps: RouterStep[] };

/** 복합 질의(여러 분야를 한 번에 묻는 질의)를 하위 질문으로 나누는 방법. */
export type SplitMethod = "none" | "heuristic" | "llm";

export type SplitConfig = {
  method: SplitMethod;
  /** 하위 질문의 최대 개수와 최소 길이(heuristic, llm 공통 상한). */
  maxParts: number;
  minChars: number;
  /** 하위 질문 하나에서 고르는 조사원 수의 상한. */
  partTopK: number;
  /** llm 방식에서 쓰는 프롬프트. {{query}}, {{maxParts}} 를 채운다. */
  prompt: string;
};

/** 라우터 설정. 질의 분해 → 1단계(조사원) → 2단계(선택된 조사원에 연결된 프로시저). 단계마다 라우팅 단계들의 파이프라인이다. */
export type RouterConfig = {
  split: SplitConfig;
  researcher: StageConfig;
  procedure: StageConfig;
};

/** 라우팅 단계 하나가 실제로 한 일: 입력·출력 후보 수, 걸린 시간, 건너뜀·실패 사유. */
export type StepTrace = { type: RouterStep["type"]; input: number; output: number; ms: number; note?: string };

/** 개별 라우터를 가진 조사원 하나의 판정 기록: 포함 여부, 파이프라인 모드, 단계별 기록. */
export type IndividualTrace = { researcher: string; selected: boolean; mode: string; steps: StepTrace[] };

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
  /** reevaluate 계획의 마지막 라운드 답변을 그대로 썼다(같은 프롬프트 · 같은 최종 컨텍스트라 다시 부르지 않았다). */
  fromPlan?: boolean;
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
  /** 프로시저 라우팅 방법(keyword · embedding · llm …). 기본 프로시저가 폴백으로 붙은 쌍은 `default`, 자료가 없어 라우팅을 건너뛴 쌍은 `skipped(no-material)`. */
  procedureRouting: string;
  /** 컨텍스트 계획 모드에서 이 쌍을 만든 아이템 이름(classic 모드에는 없다). */
  item?: string;
};

/** 라우팅 판단의 근거. 조사원 후보 점수와, 선택된 조사원마다의 프로시저 후보 점수. */
export type RoutingTrace = {
  /** 질의 분해 결과(통째 질의 하나이면 하위 질문 없음). */
  parts?: string[];
  /** 통째 질의와 하위 질문별로 라우팅 단계가 한 일. */
  researcherSteps?: { asked: string; steps: StepTrace[] }[];
  /** 개별 라우터를 가진 조사원의 판정(통째 질의와 하위 질문별). */
  individual?: { asked: string; results: IndividualTrace[] }[];
  researchers: RoutingScore[];
  procedures: {
    researcher: string;
    candidates: RoutingScore[];
    /** `default`: 프로시저 라우팅이 하나도 고르지 못해 조사원의 기본 프로시저가 대신 붙었다(폴백). 없으면 라우팅이 골랐거나 아무것도 붙지 않았다. */
    fallback?: "default";
  }[];
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

/** 실행이 어디서 왔는가: 관리자 사이트의 시험 실행(test) · MCP 도구 호출(mcp). 옛 행은 test. */
export type RunSource = "test" | "mcp";

/** 실행 로그 목록의 한 줄. 선택된 조사원 · 프로시저는 실행 기록의 pairs 에서 뽑은 이름이다(중복 제거, 선택 순서 유지). */
export type RunListItem = {
  id: number;
  createdAt: string;
  query: string;
  status: "running" | "ok" | "error";
  durationMs: number;
  source: RunSource;
  researchers: string[];
  procedures: string[];
  /** 검색어(q)가 있을 때만: 질의가 맞은 방식과 점수(키워드는 fts 순위, 의미는 코사인 유사도). */
  match?: { by: "keyword" | "semantic"; score: number };
};

/** GET /runs 의 응답. 쪽번호는 1부터. */
export type RunListPage = { items: RunListItem[]; total: number; page: number; pageSize: number };

/** GET /runs/filters 의 응답: 목록 필터에 쓸 수 있는 이름들(실행 기록에 실제로 나온 것만, 가나다순). */
export type RunFilterOptions = { researchers: string[]; procedures: string[] };

export const serviceDomain = Object.freeze({
  service: "dualcontext",
  packageName: "dualcontext_domain"
});

export * from "./plan/index.js";
export * from "./run-node/index.js";
