/** 연구원: 출처마다 하나. 원재료를 모을 뿐 해석하지 않는다. */
export type Researcher = {
  id: number;
  name: string;
  description: string;
  /** 질의에 이 단어가 들어 있으면 이 연구원이 선택된다(라우팅 신호). */
  keywords: string[];
  enabled: boolean;
};

/** 사서가 가진 프로시저: 사람이 써 둔 분석·평가 순서와 기준. 정보 자체는 담지 않는다. */
export type Procedure = {
  id: number;
  researcherId: number;
  name: string;
  /** 질의에 이 단어가 있으면 적용된다. 비어 있으면 항상 적용된다. */
  appliesWhen: string[];
  steps: string[];
  impacts: string[];
  outputFormat: string;
  enabled: boolean;
};

/** 연구원이 출처에서 모은 원재료 한 조각. */
export type Material = {
  title: string;
  text: string;
};

/** 라이터 입력 한 쌍: 연구원이 모은 정보와 그 정보에 묶인 프로시저. */
export type Pair = {
  researcher: Researcher;
  procedure: Procedure | null;
  materials: Material[];
};

export type AugmentResult = {
  context: string;
  /** 라우팅이 신호 없이 전체 연구원으로 되돌아갔는가. */
  researcherRouting: "matched" | "fallback-all" | "none";
  pairs: { researcher: string; procedure: string | null; materialCount: number }[];
};

export const serviceDomain = Object.freeze({
  service: "dualcontext",
  packageName: "dualcontext_domain"
});
