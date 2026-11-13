# API

| Export | 용도 |
| --- | --- |
| `dualcontext_domain` | 공통 진입점(모델 타입). |
| `dualcontext_domain/common` | 런타임 중립: `Researcher`, `Procedure`, `RouterConfig`, `WriterConfig`, `Material`, `Pair`, `AugmentResult`. |
| `dualcontext_domain/server` | 서버 전용: `augmentQuery`, 라우팅 규칙, `writeContext`, `mergeContexts`. |
| `dualcontext_domain/front` | 프런트 전용(현재 비어 있음). |

## 계약

| 함수 | 계약 | 위치 |
| --- | --- | --- |
| `routeResearchersByKeyword(query, researchers, topK)` | 사용 가능한 조사원 중 키워드가 질의에 포함된 것을 점수순 상위 K. 맞는 것이 없으면 전체의 앞 K(`keyword-fallback-all`), 없으면 `none`. | `src/server/route` |
| `routeProceduresByKeyword(query, procedures, topK)` | 적용 조건이 맞은 프로시저, 없으면 조건이 빈 프로시저만, 상위 K. | `src/server/route` |
| `topKByEmbedding(queryVector, items, topK)` | 코사인 유사도 상위 K. 차원이 다른 항목은 건너뛴다. | `src/server/route` |
| `parseIdSelection(text, validIds, topK)` | LLM 답에서 후보 id 를 순서대로. 후보 밖 · 중복은 버린다. | `src/server/route` |
| `writeContext(query, pairs)` | 쌍을 **조사원 기준으로** 묶어 자료(출처 번호 `R<조사원id>-<순번>` · 유사도)를 한 번만 싣고, 그 조사원의 프로시저를 「분석 관점(제안)」으로 나열한다. 「찾지 못한 것」은 실제로 자료가 없거나 수집이 실패한 조사원이 있을 때만 쓴다(거짓 「없음」을 쓰지 않는다)(수집 실패)을 적는다. | `src/server/write` |
| `mergeContexts(query, parts)` | 쌍별로 만든 조각을 이어 붙인다. 조각 사이 모순은 풀지 않는다. | `src/server/write` |
| `augmentQuery(query, ports)` | 조사원 선택 → 수집 → 프로시저 선택 → 라이터. `writer.mode` 가 `batch` 면 1회, `per_pair` 면 쌍 수만큼 호출. 결과에 라우팅 방법과 호출 수가 들어 있다. | `src/server/augment` |
