# 개요

`dualcontext_domain` 은 `apps/dualcontext` 와 짝을 이루는 단일 도메인 패키지다.
「확장된 Dual RAG」의 규칙을 프레임워크 없이 담는다.

| 개념 | 정의 | 코드 |
| --- | --- | --- |
| 연구원(Researcher) | 출처마다 하나. 질의에 대한 원재료를 모을 뿐 해석하지 않는다. | `src/common/model` |
| 프로시저(Procedure) | 사서가 가진, 사람이 써 둔 분석·평가 순서와 임팩트 기준. 연구원마다 여럿. | `src/common/model` |
| 라우팅 | 질의로 연구원을 고르고, (질의, 연구원)으로 프로시저를 고른다. | `src/server/route` |
| 라이터 | 모든 (연구원 정보, 프로시저) 쌍을 받아 다음 단계용 컨텍스트를 만든다. | `src/server/write` |
| 증강 | 위 전체를 잇는 진입점 `augmentQuery`. | `src/server/augment` |

Express, Vite, PostgreSQL, MCP 는 앱 모듈이 소유한다. 이 패키지는 저장소와 출처
접근을 `AugmentPorts` 로만 받는다.
