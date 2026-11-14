// 질의 로그 분석에서 드러난 빈 분야(제빵·식품, 양육, 재테크, 노동·생활법, how-to, 일반 상식 등)용 domain.json 을 만든다.
// 실행(저장소 루트에서): node test/20261115/make-domains.mjs
// 결과: apps/dualcontext/seed-data/domains/<이름>/domain.json
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join("apps", "dualcontext", "seed-data", "domains");
const KOALPACA_LICENSE = "라이선스 미표기(허깅페이스 카드에 없음). 네이버 지식iN 질문과 모델 생성 답변이라 사실 확인이 필요하다";
// 일상 Q&A 는 주제끼리 의미가 가까워 전문 분야 기준(0.72)이 느슨하다. 측정 test/20261115/row-score-everyday_result.json:
// 기준 0.76 에서 맞는 질의 14/17 유지, 무관 질의 12개 중 9개가 빈 컨텍스트(0.72 는 17/17, 5/12).
const EVERYDAY_MIN_SCORE = 0.76;
const koalpaca = {
  dataset: "beomi/KoAlpaca-v1.1a", config: "default", split: "train", license: KOALPACA_LICENSE, limit: 300,
  map: { id: "{url}", title: "{instruction}", body: "{output}", embed: "{instruction}\n{output}" }
};
const kmmlu = (config) => ({
  dataset: "HAERAE-HUB/KMMLU", config, split: "test", license: "cc-by-nd-4.0 (KMMLU, 해설 없는 시험 문제)", limit: 300,
  map: { title: "{question}", body: "{question}\n정답: {answerText}", embed: "{question}\n{answerText}" }
});

const proc = (name, appliesWhen, steps, impacts, outputFormat) => ({ name, appliesWhen, steps, impacts, outputFormat });
const shared = ["근거 신뢰도 점검"];
const solve = (tag) => proc(`[${tag}] 문제 풀이 근거`, ["옳은", "설명"], ["문제의 단서를 뽑는다", "정답 선택지와 대조한다"], ["단서", "정답 근거"], "단서 → 정답");

const domains = [
  {
    name: "life-cooking", table: "ds_life_cooking", ...koalpaca, filter: "반죽|제빵|베이킹|레시피|요리|조리법|발효|식재료|김치|반찬|밥솥",
    researcher: { name: "요리·제빵·식품 생활 Q&A", description: "요리, 제빵, 반죽, 발효, 식재료 손질과 보관, 조리 방법 같은 가정 요리와 식품 생활 질문에 사람이 답한 기록. 어떻게 만드는지, 왜 그렇게 되는지, 실패했을 때 어떻게 하는지 묻는 질의를 맡는다.", keywords: ["요리", "제빵", "반죽", "레시피", "발효", "식재료"] },
    procedures: [
      proc("[요리] 원리와 순서 설명", ["어떻게", "방법", "왜", "과정"], ["묻는 조리 과정과 목적을 확인한다", "자료에서 원리 설명과 단계를 찾는다", "실패 징후와 대처가 있으면 붙인다"], ["핵심 원리", "단계별 순서", "실패 징후와 대처"], "원리 한 문단 + 번호 순서"),
      proc("[요리] 재료·분량 정리", ["재료", "분량", "비율"], ["자료에 나온 재료와 분량을 모은다", "자료마다 다른 분량은 구분한다"], ["재료 목록", "분량 차이"], "표")
    ],
    link: shared
  },
  {
    name: "parenting-teen", table: "ds_parenting_teen", ...koalpaca, filter: "사춘기|육아|아기|청소년|자녀|학부모|초등학생|중학생|고등학생|아들|훈육",
    researcher: { name: "육아·청소년 양육 Q&A", description: "육아, 사춘기와 청소년 자녀와의 갈등, 훈육과 대화 방법, 학교와 학습 문제 같은 양육 질문에 사람이 답한 기록. 아이를 어떻게 대해야 하는지 조언을 구하는 질의를 맡는다.", keywords: ["육아", "사춘기", "청소년", "자녀", "훈육", "학부모"] },
    procedures: [
      proc("[양육] 상황별 조언 정리", ["어떻게 대해", "조언", "고민"], ["상황과 연령을 확인한다", "자료에서 비슷한 사례의 조언을 찾는다", "공통된 조언과 상반된 조언을 나눈다"], ["공통 조언", "상반된 의견", "주의할 점"], "상황 한 줄 + 조언 목록"),
      proc("[양육] 위험 신호 점검", ["심각", "폭력", "우울", "자해"], ["위험 신호가 언급됐는지 확인한다", "전문가 상담이 필요한 경우를 가려낸다"], ["위험 신호", "상담 필요 여부"], "체크 목록")
    ],
    link: shared
  },
  {
    name: "health-life", table: "ds_health_life", ...koalpaca, filter: "증상|병원|영양제|비타민|다이어트|통증|수면|두통|소화|감기",
    researcher: { name: "생활 건강 상담 Q&A", description: "일상에서 겪는 증상, 병원 진료 여부, 영양제와 식단, 수면과 운동 같은 생활 건강 질문에 사람이 답한 기록. 의학 시험이 아니라 일반인이 건강을 어떻게 관리하는지 묻는 질의를 맡는다.", keywords: ["증상", "병원", "영양제", "다이어트", "수면", "통증"] },
    procedures: [
      proc("[건강] 증상 정리와 진료 판단", ["증상", "아프", "병원"], ["증상과 지속 기간을 정리한다", "자료에서 원인 후보와 대처를 찾는다", "진료가 필요한 경우를 구분한다"], ["원인 후보", "자가 대처", "진료 필요 신호"], "증상 → 가능성 → 대처 표"),
      proc("[건강] 상반된 조언 구분", ["효과", "좋은가", "먹어도"], ["자료마다 권하는 바를 모은다", "근거가 있는 것과 경험담을 나눈다"], ["권장", "경험담", "상충"], "근거 구분 목록")
    ],
    link: ["근거 신뢰도 점검", "수치·사실 추출"]
  },
  {
    name: "money-basics", table: "ds_money_basics", ...koalpaca, filter: "주식|투자|펀드|채권|적금|예금|대출|연말정산|ETF|원자재|금리|환율|세금",
    researcher: { name: "재테크·세금 생활 Q&A", description: "주식, 채권, 펀드, 예적금, 대출과 금리, 환율, 연말정산과 세금 같은 개인 재테크 질문에 사람이 답한 기록. 개념이 무엇인지, 어떤 상품이 유리한지, 세금이 어떻게 되는지 묻는 질의를 맡는다.", keywords: ["투자", "주식", "금리", "대출", "세금", "연말정산"] },
    procedures: [
      proc("[재테크] 개념과 선택지 비교", ["차이", "유리", "뭐가", "비교"], ["묻는 개념이나 상품을 확정한다", "자료에서 정의와 장단점을 찾는다", "선택지가 둘 이상이면 같은 항목으로 나란히 놓는다"], ["정의", "장단점", "비용·세금"], "비교표 + 한 줄 결론"),
      proc("[재테크] 계산 근거 정리", ["계산", "얼마", "세율"], ["자료의 공식·세율·한도를 뽑는다", "적용 조건을 확인한다"], ["공식", "세율·한도", "적용 조건"], "식 + 적용 조건")
    ],
    link: ["근거 신뢰도 점검", "수치·사실 추출"]
  },
  {
    name: "life-law", table: "ds_life_law", ...koalpaca, filter: "근로|퇴직금|해고|임금|휴업|임대차|전세|보증금|상속|이혼|손해배상|합의금|계약서",
    researcher: { name: "생활·노동 법률 상담 Q&A", description: "근로계약과 퇴직금, 해고와 휴업수당, 임대차와 전세 보증금, 상속과 이혼, 손해배상 같은 생활 속 법률 문제에 사람이 답한 기록. 내 경우에 어떤 권리와 절차가 있는지 묻는 질의를 맡는다.", keywords: ["근로", "퇴직금", "해고", "임대차", "보증금", "상속"] },
    procedures: [
      proc("[생활법] 권리와 절차 정리", ["권리", "절차", "신청", "받을 수"], ["사실관계에서 쟁점을 뽑는다", "자료에서 적용 기준과 절차를 찾는다", "기한과 증빙을 확인한다"], ["적용 기준", "절차", "기한·증빙"], "쟁점 → 기준 → 절차 순"),
      proc("[생활법] 금액·비율 확인", ["얼마", "비율", "수당"], ["자료의 금액과 비율을 뽑는다", "적용 조건을 붙인다"], ["금액·비율", "적용 조건"], "표")
    ],
    link: ["근거 신뢰도 점검", "수치·사실 추출"]
  },
  {
    name: "travel-leisure", table: "ds_travel_leisure", ...koalpaca, filter: "여행|관광|항공|호텔|캠핑|등산|비행기|비자|해외여행",
    researcher: { name: "여행·여가 Q&A", description: "국내외 여행 일정, 항공과 숙소, 비자와 입국 준비, 캠핑과 등산 같은 여가 활동 질문에 사람이 답한 기록. 어디를 어떻게 다녀오면 좋은지, 무엇을 준비해야 하는지 묻는 질의를 맡는다.", keywords: ["여행", "항공", "숙소", "비자", "캠핑", "등산"] },
    procedures: [
      proc("[여행] 준비 체크리스트", ["준비", "필요", "일정"], ["여행 목적지와 기간을 확인한다", "자료에서 준비물과 절차를 모은다"], ["준비물", "예약·서류", "주의점"], "체크리스트"),
      proc("[여행] 선택지 비교", ["비교", "추천", "어디"], ["후보를 모은다", "비용·이동·계절을 같은 기준으로 놓는다"], ["비용", "이동", "계절"], "비교표")
    ],
    link: shared
  },
  {
    name: "pc-howto", table: "ds_pc_howto", ...koalpaca, filter: "포토샵|엑셀|파워포인트|윈도우|이미지|사진|파일|스마트폰|프린터|인터넷|프로그램",
    researcher: { name: "PC·스마트폰 사용법 Q&A", description: "포토샵과 엑셀 같은 프로그램 사용법, 윈도우와 스마트폰 설정, 사진과 파일 다루기, 프린터와 인터넷 문제 해결 같은 일상 IT 사용 질문에 사람이 답한 기록. 무엇을 눌러 어떻게 하는지 순서를 묻는 질의를 맡는다.", keywords: ["포토샵", "엑셀", "윈도우", "스마트폰", "사진", "파일"] },
    procedures: [
      proc("[사용법] 단계별 조작 순서", ["방법", "어떻게", "순서", "하려면"], ["하려는 작업과 사용 환경을 확인한다", "자료에서 조작 순서를 찾는다", "버전·환경이 다르면 구분한다"], ["준비", "단계별 조작", "자주 막히는 곳"], "번호 순서"),
      proc("[사용법] 문제 원인 좁히기", ["안 돼", "오류", "안됩니다"], ["증상을 확인한다", "자료에서 원인 후보와 해결책을 찾는다"], ["원인 후보", "해결 순서"], "원인 → 해결 표")
    ],
    link: shared
  },
  {
    name: "culture-history", table: "ds_culture_history", ...koalpaca, filter: "역사|조선|고려|신라|삼국|전쟁|유래|전통|속담|맞춤법|어원",
    researcher: { name: "역사·문화·언어 상식 Q&A", description: "한국과 세계의 역사, 전통과 풍습, 말과 속담의 유래, 맞춤법과 어원 같은 인문 상식 질문에 사람이 답한 기록. 무엇이 언제 어떻게 생겼고 무슨 뜻인지 묻는 질의를 맡는다.", keywords: ["역사", "조선", "유래", "전통", "속담", "어원"] },
    procedures: [
      proc("[인문] 유래와 맥락 정리", ["유래", "언제", "왜", "뜻"], ["묻는 대상과 시대를 확정한다", "자료에서 유래와 맥락을 찾는다", "설이 갈리면 나눈다"], ["유래", "시대 맥락", "이설"], "시간순 설명"),
      proc("[인문] 뜻과 쓰임 구분", ["뜻", "의미", "차이"], ["표현의 뜻을 모은다", "쓰임의 차이를 구분한다"], ["뜻", "쓰임 차이"], "뜻 + 예")
    ],
    link: shared
  },
  {
    name: "science-general", table: "ds_science_general", ...koalpaca, filter: "원리|화학|물리|생물|지구|우주|전기|에너지|분자|세포|기후",
    researcher: { name: "과학 원리 상식 Q&A", description: "화학, 물리, 생물, 지구와 우주, 전기와 에너지, 기후 같은 과학 현상이 왜 일어나는지 사람이 풀어 쓴 질문과 답. 일상 속 현상의 원리를 묻는 질의를 맡는다.", keywords: ["원리", "화학", "물리", "생물", "에너지", "기후"] },
    procedures: [
      proc("[과학] 원리 설명", ["원리", "왜", "어떻게"], ["현상을 정확히 정의한다", "자료에서 원리와 인과를 찾는다"], ["원리", "인과 단계"], "인과 사슬"),
      proc("[과학] 오개념 점검", ["사실", "맞나", "진짜"], ["흔한 오해를 확인한다", "자료의 설명과 대조한다"], ["오해", "정정"], "오해 → 정정")
    ],
    link: shared
  },
  {
    name: "kmmlu-korean-history", table: "ds_kmmlu_korean_history", ...kmmlu("Korean-History"), limit: 100,
    researcher: { name: "한국사 시험 문제은행", description: "고려와 조선, 근현대사 사료를 보고 사건과 제도를 고르는 한국사 시험 문제와 정답. 어떤 제도나 사건이 무엇이었는지 묻는 한국사 질의를 맡는다. 해설이 없어 정답 선택지만 근거가 된다.", keywords: ["한국사", "고려", "조선", "사료", "제도", "근현대사"] },
    procedures: [proc("[한국사] 사건·제도 확인", ["사건", "제도", "시기"], ["사료의 시대와 제도를 확인한다", "정답 선택지에서 사실을 뽑는다"], ["시대", "제도·사건 내용"], "시대 + 내용 한 줄"), solve("한국사")],
    link: shared
  },
  {
    name: "kmmlu-psychology", table: "ds_kmmlu_psychology", ...kmmlu("Psychology"),
    researcher: { name: "심리·상담 이론 문제은행", description: "진로이론, 상담이론, 발달과 학습, 심리검사 같은 심리학 시험 문제와 정답. 이론이나 학자의 주장이 무엇인지 묻는 심리학 질의를 맡는다. 해설이 없다.", keywords: ["심리", "상담", "진로이론", "발달", "학습", "심리검사"] },
    procedures: [proc("[심리] 이론 정의 정리", ["이론", "학자", "단계"], ["묻는 이론과 학자를 확정한다", "정답 선택지에서 주장을 뽑는다"], ["이론 주장", "단계·구성"], "이론 → 핵심 주장"), solve("심리")],
    link: shared
  },
  {
    name: "kmmlu-economics", table: "ds_kmmlu_economics", ...kmmlu("Economics"), limit: 130,
    researcher: { name: "경제·회계·금융 제도 문제은행", description: "회계의 정의와 원칙, 금융 거래 제도, 경제 개념을 묻는 시험 문제와 정답. 회계와 금융 제도가 무엇인지 묻는 질의를 맡는다. 해설이 없다.", keywords: ["회계", "금융", "경제", "제도", "실명거래", "원칙"] },
    procedures: [proc("[경제] 개념·제도 정의", ["정의", "원칙", "제도"], ["묻는 개념을 확정한다", "정답 선택지에서 정의를 뽑는다"], ["정의", "적용 조건"], "정의 + 조건"), solve("경제")],
    link: shared
  },
  {
    name: "kmmlu-real-estate", table: "ds_kmmlu_real_estate", ...kmmlu("Real-Estate"), limit: 200,
    researcher: { name: "부동산·공인중개 문제은행", description: "부동산 거래와 공인중개, 등기와 임대차, 부동산 공법과 감정평가를 묻는 시험 문제와 정답. 부동산 제도와 절차를 묻는 질의를 맡는다. 해설이 없다.", keywords: ["부동산", "공인중개", "등기", "임대차", "감정평가", "공법"] },
    procedures: [proc("[부동산] 제도와 절차 확인", ["절차", "요건", "등기"], ["묻는 제도를 확정한다", "정답 선택지에서 요건을 뽑는다"], ["요건", "절차"], "요건 → 절차"), solve("부동산")],
    link: shared
  },
  {
    name: "kmmlu-environment", table: "ds_kmmlu_environment", ...kmmlu("Environmental-Science"),
    researcher: { name: "환경 과학·공학 문제은행", description: "대기와 수질, 폐기물, 환경 규제와 측정, 오염 물질 처리를 묻는 환경 분야 시험 문제와 정답. 환경 오염과 처리 기술이 무엇인지 묻는 질의를 맡는다. 해설이 없다.", keywords: ["환경", "대기", "수질", "폐기물", "오염", "규제"] },
    procedures: [proc("[환경] 오염과 처리 개념 정리", ["오염", "처리", "기준"], ["묻는 오염 물질과 매체를 확정한다", "정답 선택지에서 처리 원리를 뽑는다"], ["원리", "기준값"], "원리 + 기준"), solve("환경")],
    link: shared
  },
  {
    name: "kmmlu-agriculture", table: "ds_kmmlu_agriculture", ...kmmlu("Agricultural-Sciences"),
    researcher: { name: "농업·작물 문제은행", description: "작물 재배, 토양과 비료, 병해충 방제, 농업 기술을 묻는 농학 시험 문제와 정답. 작물을 어떻게 기르고 관리하는지 묻는 질의를 맡는다. 해설이 없다.", keywords: ["농업", "작물", "재배", "비료", "병해충", "토양"] },
    procedures: [proc("[농업] 재배 관리 정리", ["재배", "비료", "방제"], ["작물과 시기를 확정한다", "정답 선택지에서 관리 사실을 뽑는다"], ["관리 방법", "주의점"], "작물별 관리"), solve("농업")],
    link: shared
  },
  {
    name: "kmmlu-energy", table: "ds_kmmlu_energy", ...kmmlu("Energy-Management"),
    researcher: { name: "에너지 관리·발전 문제은행", description: "에너지 절약과 관리, 발전과 열 설비, 신재생 에너지와 전력 효율을 묻는 시험 문제와 정답. 에너지 설비와 관리 개념이 무엇인지 묻는 질의를 맡는다. 해설이 없다.", keywords: ["에너지", "발전", "신재생", "열설비", "효율", "전력"] },
    procedures: [proc("[에너지] 설비·개념 정리", ["설비", "효율", "발전"], ["묻는 설비나 개념을 확정한다", "정답 선택지에서 사실을 뽑는다"], ["원리", "효율 기준"], "원리 + 기준"), solve("에너지")],
    link: shared
  }
];

for (const domain of domains) if (domain.dataset === "beomi/KoAlpaca-v1.1a") domain.researcher.minScore = EVERYDAY_MIN_SCORE;

for (const { name, ...spec } of domains) {
  const { table, dataset, config, split, license, limit, filter, map, researcher, procedures, link } = spec;
  mkdirSync(path.join(root, name), { recursive: true });
  const body = { name, table, dataset, config, split, license, limit, ...(filter ? { filter } : {}), map, researcher, procedures, link };
  writeFileSync(path.join(root, name, "domain.json"), JSON.stringify(body, null, 2) + "\n", "utf8");
}
console.log(`${domains.length} domains written`);
