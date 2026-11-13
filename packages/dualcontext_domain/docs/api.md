# API

| Export | 용도 |
| --- | --- |
| `dualcontext_domain` | 공통 진입점(모델 타입). |
| `dualcontext_domain/common` | 런타임 중립: `Researcher`, `Procedure`, `Material`, `Pair`, `AugmentResult`. |
| `dualcontext_domain/server` | 서버 전용: `augmentQuery`, `routeResearchers`, `routeProcedures`, `writeContext`. |
| `dualcontext_domain/front` | 프런트 전용(현재 비어 있음). |

## 계약

| 함수 | 계약 | 위치 |
| --- | --- | --- |
| `routeResearchers(query, researchers)` | 사용 가능한 연구원 중 키워드가 질의에 포함된 것만 점수순으로 고른다. 맞는 것이 없으면 사용 가능한 전체(`fallback-all`), 사용 가능한 것이 없으면 `none`. | `src/server/route` |
| `routeProcedures(query, procedures)` | 적용 조건 키워드가 맞는 프로시저를 고른다. 맞는 것이 없으면 조건이 빈(항상 적용) 프로시저만 남긴다. | `src/server/route` |
| `writeContext(query, pairs)` | 쌍을 프로시저 기준으로 묶어 절차 · 임팩트 · 출력 형식 · 근거(출처 포함)를 나열하고, 자료 없음 · 프로시저 없음을 「부족한 항목」으로 적는다. | `src/server/write` |
| `augmentQuery(query, ports)` | 연구원 라우팅 → 연구원별 `collect` → 프로시저 라우팅 → 라이터. 한 연구원에 프로시저가 여럿이면 쌍도 여럿. `ports.write` 로 라이터를 바꿀 수 있다. | `src/server/augment` |
