import type { ResearcherType, StageConfig } from "dualcontext_domain/common";

// 사전 정의 조사원. 데이터셋은 허깅페이스에서 받아 ds_* 테이블에 적재한다(seed-data/load-datasets.mjs).
// description 은 임베딩 라우팅이 읽는 글이므로 어떤 질의를 맡는지 구체적으로 쓴다.
export type ResearcherPreset = {
  name: string;
  description: string;
  keywords: string[];
  type: ResearcherType;
  config: Record<string, unknown>;
  /** 연결할 프로시저 이름(연결 순서). */
  procedures: string[];
  /** 개별 라우터. 없으면 전역 라우터가 고른다. */
  router?: StageConfig;
};

/**
 * 웹 검색의 개별 라우터 프롬프트. 웹 검색은 특정 분야의 자료가 아니라 공개된 정보 전반을 보완하는 출처라서 범위를 넓게 잡는다:
 * 외부 정보가 도움이 될 여지가 있으면 쓰고, 웹에서 찾을 것이 전혀 없는 질의만 뺀다. 애매하면 쓴다(빠뜨리는 쪽이 더 나쁘다).
 */
export const webRouterPrompt = `너는 아래 웹 검색 조사원을 이번 질의에 쓸지 판정하는 라우터다. 웹 검색은 공개된 정보 전반에서 근거를 찾는 보완 출처다.

질의: {{query}}

조사원:
{{candidates}}

규칙:
- 웹에서 찾을 수 있는 정보가 답에 조금이라도 도움이 될 것 같으면 쓴다: 뉴스 · 날씨 · 가격 · 환율 · 주가 · 일정, 제품 · 서비스 · 인물 · 장소 · 사건에 대한 사실 확인, 최근의 규정 · 버전 · 출시 · 변경, 후기 · 비교 · 추천 · 방법, 일반 상식과 개념 설명, 전문 분야의 최신 동향이나 외부 근거. 조언 · 고민 · 인간관계 · 생활 질문, 프로그래밍 · 기술 · 코드 질문(문서 · 예제 · 해결 사례)도 관련 글이 있으므로 쓴다.
- 다른 전문 자료 조사원이 같이 고를 만한 질의라도 웹 검색은 함께 쓴다(서로 보완한다).
- 외부 정보가 필요 없는 경우에만 쓰지 않는다: 인사 · 잡담 · 감사 같은 대화, 주어진 문장의 번역 · 요약 · 교정, 순수 계산, 질의 안에 이미 답에 필요한 내용이 다 있는 작업.
- 판단이 애매하면 쓴다.

쓰면 조사원의 id 를, 쓰지 않으면 빈 배열을 JSON 배열로만 답하라. 예: [7] 또는 [].`;

const table = (name: string) => ({
  table: name,
  vectorColumn: "embedding",
  reducedColumn: "embedding_mrl",
  reducedDim: 256,
  textColumn: "body",
  titleColumn: "title",
  topK: 3
});

export const researcherPresets: ResearcherPreset[] = [
  {
    name: "법률 용어 사전",
    description: "법률 용어의 뜻과 정의를 한자 표기와 함께 설명하는 사전. 합병, 소멸, 승계 같은 법률 개념이 무엇인지 묻는 질의를 맡는다. (허깅페이스 JusWis/korean-legal-terminology, CC-BY-4.0)",
    keywords: ["법률", "용어", "뜻", "정의", "합병", "법인"],
    type: "pgvector",
    config: table("ds_legal_terms"),
    procedures: ["용어 정의 정리", "근거 신뢰도 점검", "수치·사실 추출"]
  },
  {
    name: "판례·법령 질의응답",
    description: "대법원 판례와 그 판례가 해석하는 법령 조문을 연결한 질의응답. 특정 조문을 법원이 어떻게 판단했는지, 사건의 쟁점과 판시사항을 묻는 질의를 맡는다. (허깅페이스 ggh5454/korean-legal-qa-dataset, CC-BY-4.0)",
    keywords: ["판례", "판결", "조문", "대법원", "소송", "선고"],
    type: "pgvector",
    config: table("ds_legal_cases"),
    procedures: ["판례-법령 연결 분석", "근거 신뢰도 점검", "수치·사실 추출"]
  },
  {
    name: "의학 문제은행",
    description: "내과 등 과목별 임상 의학 문제와 정답. 환자의 증상, 검사 소견, 진단과 치료 선택을 묻는 의학 질의를 맡는다. (허깅페이스 hcw0329/medical-korean-alpaca, Apache-2.0)",
    keywords: ["진단", "치료", "환자", "증상", "검사", "질환", "의학"],
    type: "pgvector",
    config: table("ds_medical_exam"),
    procedures: ["문제 풀이 근거 정리", "근거 신뢰도 점검"]
  },
  {
    name: "산업 뉴스(합성)",
    description: "반도체, 클라우드, 에너지 등 산업 이슈를 다루는 한국어 뉴스. 기업과 공급망, 규제, 투자 동향이 산업에 미치는 영향을 묻는 질의를 맡는다. 합성 데이터라 사실 확인이 필요하다. (허깅페이스 podongchip/korean-synthetic-industry-news, CC-BY-4.0)",
    keywords: ["산업", "기업", "반도체", "공급", "투자", "규제", "뉴스"],
    type: "pgvector",
    config: table("ds_industry_news"),
    procedures: ["산업 이슈 영향 분석", "시황·동향 요약", "근거 신뢰도 점검", "수치·사실 추출", "비교 분석"]
  },
  {
    name: "금융 시황 리포트(합성)",
    description: "주식시장 시황, 코스피와 해외 증시, 금리와 환율, 증권사 리포트 형식의 금융 분석. 시장 방향과 원인, 지표 수치를 묻는 질의를 맡는다. 합성 데이터라 사실 확인이 필요하다. (허깅페이스 nmixx-fin/synthetic_financial_report_korean, Apache-2.0)",
    keywords: ["시황", "증시", "코스피", "금리", "환율", "주가", "금융"],
    type: "pgvector",
    config: table("ds_finance_reports"),
    procedures: ["시황·동향 요약", "수치·사실 추출", "비교 분석", "근거 신뢰도 점검"]
  },
  {
    name: "웹 검색(덕덕고)",
    description: "웹 검색으로 공개된 정보 전반에서 근거를 찾는다. 뉴스 · 날씨 · 가격 · 환율 · 주가 · 일정, 제품 · 서비스 · 인물 · 장소 · 사건의 사실 확인, 최근의 규정 · 버전 · 출시, 후기 · 비교 · 추천 · 방법, 일반 상식과 개념 설명, 전문 분야의 최신 동향까지 웹에서 근거를 찾을 수 있는 대부분의 질의에 쓰고, 전문 자료 조사원과 함께 보완 근거로도 쓴다.",
    keywords: ["검색", "최신", "오늘", "현재", "뉴스", "날씨", "가격", "환율", "후기", "비교", "추천", "방법", "정보"],
    type: "duckduckgo",
    config: { topK: 5 },
    procedures: ["근거 신뢰도 점검", "수치·사실 추출", "비교 분석",
      "[웹] 실시간 현황·날씨 확인",
      "[웹] 최신 동향·뉴스 타임라인",
      "[웹] 사실 확인·교차 검증",
      "[웹] 시세·가격·환율 확인",
      "[웹] 일정·날짜·시간 확인",
      "[웹] 제품·서비스 비교 및 구매 가이드",
      "[웹] 후기·평판 요약",
      "[웹] 방법·절차 안내",
      "[웹] 장소·여행·이동 정보 정리",
      "[웹] 규정·정책·제도 변경 확인",
      "[웹] 개념·배경 설명",
      "[웹] 기술 문제 해결·사용법",
      "[웹] 조언·사례 정리",
      "[웹] 건강·의학 정보 정리",
      "[웹] 인물·기업·단체 정보 정리",
      "[웹] 쟁점·찬반 정리"],
    router: { steps: [{ type: "llm", topK: 1, prompt: webRouterPrompt, showScores: false, allowNone: true, parts: false, onError: "skip" }] }
  }
];
