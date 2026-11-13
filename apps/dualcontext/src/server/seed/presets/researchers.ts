import type { ResearcherType } from "dualcontext_domain/common";

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
};

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
    description: "오늘 · 최근 뉴스, 현재 날씨 · 가격 · 환율 · 일정처럼 시점에 민감한 최신 정보만 웹 검색으로 찾는다. 일반 상식, 생활 정보, 조언, 방법 설명 질의에는 쓰지 않고, 법률 · 의학 · 금융 · 하드웨어 · 논문 같은 전문 자료로 답할 수 있는 질의에도 쓰지 않는다.",
    keywords: ["최신", "오늘", "현재", "날씨", "뉴스", "가격", "환율"],
    type: "duckduckgo",
    config: { topK: 5 },
    procedures: ["근거 신뢰도 점검", "수치·사실 추출", "비교 분석"]
  }
];
