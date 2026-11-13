# 개요

`dualcontext_domain` 은 `apps/dualcontext` 와 짝을 이루는 단일 도메인 패키지다.
「확장된 Dual RAG」의 규칙을 프레임워크 없이 담는다.

| 개념 | 정의 | 코드 |
| --- | --- | --- |
| 조사원(Researcher) | 출처마다 하나. 원재료를 모을 뿐 해석하지 않는다. 프로시저를 여러 개 연결한다. | `src/common/model` |
| 프로시저(Procedure) | 사람이 써 둔 분석·평가 순서와 임팩트 기준. 조사원과 무관하게 독립. | `src/common/model` |
| 라우터 설정 | 조사원/프로시저 선택 방법과 상위 개수. | `src/common/model` |
| 라우팅 | 키워드 · 코사인 상위 K · LLM 답 파싱의 순수 규칙. 임베딩/LLM 호출은 앱이 한다. | `src/server/route` |
| 라이터 | 쌍 목록 → 컨텍스트. 결정적 조립과 쌍별 결과 이어 붙이기. | `src/server/write` |
| 증강 | 위 전체를 잇는 진입점 `augmentQuery`. 일괄/쌍별 호출 방식 처리. | `src/server/augment` |

Express, Vite, PostgreSQL, MCP, 모델 서버 호출은 앱 모듈이 소유한다. 이 패키지는 그 모두를 `AugmentPorts` 로만 받는다.
코드 식별자는 `Researcher` 이고 사용자에게 보이는 정식 명칭은 「조사원」이다.
