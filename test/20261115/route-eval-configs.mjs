// 라우팅 평가에서 비교하는 라우터 설정들. 서버의 기본 설정(GET /router/defaults)을 바탕으로 1단계(조사원)와 질의 분해만 바꾼다.
// 프로시저 단계는 모든 설정에서 같다(평가 대상이 아니다). 설정 전체가 결과 파일에 함께 기록된다.
export function buildConfigs(defaults) {
  const base = structuredClone(defaults.config);
  const emb = (extra = {}) => ({ type: "embedding", topK: 3, minScore: 0.67, margin: 0.05, parts: true, onError: "keyword", ...extra });
  const llm = (extra = {}) => ({ type: "llm", topK: 4, prompt: defaults.prompts.researcher, showScores: true, allowNone: true, parts: false, onError: "skip", ...extra });
  const make = (name, splitMethod, steps) => {
    const config = structuredClone(base);
    config.split.method = splitMethod;
    config.researcher = { steps };
    return { name, config };
  };
  return [
    // 현재 기본: 임베딩 한 단계(최소 0.67, 마진 0.05, 상위 3), 규칙으로 질의 분해.
    make("A_default", "heuristic", [emb()]),
    // 후보 폭만 넓힌 임베딩(LLM 후보 단계의 상한 재현율을 보기 위한 기준).
    make("W_wide", "none", [emb({ topK: 6, minScore: 0.6, margin: 1 })]),
    // 임베딩으로 후보 6개를 넓게 뽑고 LLM 이 최종 선택(없음 허용). 분해 없음.
    make("B_hybrid", "none", [emb({ topK: 6, minScore: 0.6, margin: 1 }), llm()]),
    // B + 규칙 분해: 하위 질문은 임베딩 단계만(LLM 은 통째 질의에만), 결과는 합집합.
    make("C_hybrid_split", "heuristic", [emb({ topK: 6, minScore: 0.6, margin: 1 }), llm()]),
    // LLM 만: 후보 27개 전부를 LLM 에 준다(임베딩 점수 없음).
    make("D_llm_only", "none", [llm({ topK: 4, showScores: false })]),
    // LLM 이 「없음」을 못 답하는 변형: LLM 은 후보를 줄이기만 한다.
    make("E_hybrid_nonone", "none", [emb({ topK: 6, minScore: 0.6, margin: 1 }), llm({ allowNone: false })]),
    // LLM 이 질의를 나누고 하위 질문은 임베딩 단계만.
    make("F_llmsplit_emb", "llm", [emb()]),
    // 가장 비싼 설정: LLM 분해 + 통째·하위 질문 모두 임베딩→LLM.
    make("G_llmsplit_hybrid", "llm", [emb({ topK: 6, minScore: 0.6, margin: 1 }), llm({ parts: true })])
  ];
}
