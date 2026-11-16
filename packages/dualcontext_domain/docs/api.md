# API

| Export | 용도 |
| --- | --- |
| `dualcontext_domain` | 공통 진입점(모델 타입). |
| `dualcontext_domain/common` | 런타임 중립: `Researcher`(`defaultProcedureId`: 프로시저 라우팅이 비었을 때 대신 붙는 기본 프로시저 id 또는 null, 선택 필드 `router`: 개별 라우터, null 이면 전역), `Procedure`, `RouterConfig`, `WriterConfig`, `Material`, `Pair`, `AugmentResult`. |
| `dualcontext_domain/server` | 서버 전용: `augmentQuery`, 라우팅 규칙, `writeContext`, `mergeContexts`, `planContext`(+ `PlanPorts`, `PlanOptions`, `PlanProgress`, `ItemBuild`, `Provided`). |
| `dualcontext_domain/front` | 프런트 전용(현재 비어 있음). |

## 계약

| 함수 | 계약 | 위치 |
| --- | --- | --- |
| `routeResearchersByKeyword(query, researchers, topK)` | 사용 가능한 조사원 중 키워드가 질의에 포함된 것을 점수순 상위 K. 맞는 것이 없으면 전체의 앞 K(`keyword-fallback-all`), 없으면 `none`. | `src/server/route` |
| `routeProceduresByKeyword(query, procedures, topK)` | 적용 조건이 맞은 프로시저, 없으면 조건이 빈 프로시저만, 상위 K. | `src/server/route` |
| `topKByEmbedding(queryVector, items, topK)` | 코사인 유사도 상위 K. 차원이 다른 항목은 건너뛴다. | `src/server/route` |
| `parseIdSelection(text, validIds, topK)` | LLM 답에서 후보 id 를 순서대로. 후보 밖 · 중복은 버린다. | `src/server/route` |
| `parseIdArray(text, validIds, topK)` | LLM 답의 **마지막** `[...]` 를 id 배열로 읽는다(앞의 것은 예시나 생각 과정). 배열이 없으면 `null`(해석 실패), `[]` 면 「없음」. | `src/server/route` |
| `selectByEmbedding(ranked, { topK, minScore, margin })` | 임베딩 단계 규칙: 최소 점수 · 최고 점수 대비 마진 · 상위 개수를 차례로 적용. | `src/server/route` |
| `selectForQuery(query, researchers, ports)` | 질의를 나누고(`ports.split`, 없으면 `splitQuery`) 통째 질의와 하위 질문을 각각 라우팅해 합집합을 돌려준다. 증강과 관리자 라우팅 미리보기가 같이 쓴다. | `src/server/augment` |
| `writeContext(query, pairs, provided?)` | 쌍을 **조사원 기준으로** 묶어 자료(출처 번호 `R<조사원id>-<순번>` · 유사도)를 한 번만 싣고, 그 조사원의 프로시저를 「분석 관점(제안)」으로 나열한다. 「찾지 못한 것」은 실제로 자료가 없거나 수집이 실패한 조사원이 있을 때만 쓴다(거짓 「없음」을 쓰지 않는다)(수집 실패)을 적는다. `provided`(사전 컨텍스트, `Provided[]`)가 있으면 조사원 자료 앞에 「사전 제공된 컨텍스트」 섹션(`describeProvided`, 안쪽 머리글은 낮춘다)을 두고, 없거나 모두 비면 이전과 같은 글이다. | `src/server/write` |
| `isWebSource(researcher)` · `webLast(pairs)` · `webSectionTitle` · `webSectionNote` | 웹 검색 계열(`type: duckduckgo`) 판별과 순서 정렬(큐레이션 쌍 앞, 웹 쌍 뒤)과 웹 섹션의 제목 · 안내 문구. `writeContext` 는 웹 쌍을 큐레이션 조사원 섹션 뒤의 별도 섹션 「웹 검색 결과(검증되지 않은 보조 자료)」에 싣고, 조사원 자료와 어긋나면 조사원 자료를 우선하라고 밝힌다. LLM 라이터(앱)는 같은 문구를 쌍 머리에 붙인다. | `src/server/write` |
| `mergeContexts(query, parts)` | 쌍별로 만든 조각을 이어 붙인다. 조각 사이 모순은 풀지 않는다. | `src/server/write` |
| `planContext(query, { config, ports, now?, onProgress? })` | 질의 → 컨텍스트 아이템 DAG → 종단점부터 웨이브 build → top 아이템 `## 이름` 섹션 조립. `reevaluate` 모드는 답변 평가 · 보강 루프. `{ context, trace: PlanTrace }`. `classic` 은 던진다. 상세는 [plan.md](plan.md). | `src/server/plan` |
| `augmentQuery(query, ports, provided?)` | 조사원 선택 → 수집 → 프로시저 선택 → 라이터. `writer.mode` 가 `batch` 면 1회, `per_pair` 면 쌍 수만큼 호출. 결과에 라우팅 방법과 호출 수가 들어 있다. `provided`(계획기의 사전 컨텍스트)는 **라이터에만** `write(query, pairs, provided)` 세 번째 인자로 간다(쌍별이면 호출마다). 라우팅 · 수집은 질의로만 한다. 비었으면 세 번째 인자 없이 부른다(classic 과 같은 호출). 쓸 자료가 없어도 내용 있는 `provided` 가 있으면 라이터를 부른다(batch: 쌍 전체로 1회, per_pair: 빈 쌍 배열로 1회 — `writeContext` 는 사전 컨텍스트 섹션만 낸다). `provided` 가 없거나 모두 비면 기존처럼 라이터 없이 `context` 는 빈 문자열. | `src/server/augment` |

## splitQuery

`splitQuery(query, { minChars?, maxParts? }): string[]` — 복합 질의를 하위 질문으로 나눈다(문장 끝, 요청·의문 어미 뒤 쉼표). 12자 미만 조각은 이웃에 붙고 최대 4개이며, 나눌 곳이 없으면 질의 하나만 돌려준다. `augmentQuery` 는 통째 질의와 하위 질문마다 `selectResearchers(query, candidates, { part: true })` 를 불러 합집합을 고른다(하위 질문 호출의 `part` 는 한 분야만 고르라는 뜻).

`parseSplitAnswer(text, maxParts): string[] | null` — LLM 이 답한 하위 질문 JSON 배열(마지막 `[...]`)을 읽는다. 읽을 수 없으면 `null`, 상한을 넘으면 뒤쪽을 합친다.

`Material.match: "identifier"` 는 질의 속 표기와 문자열로 일치해 가져온 자료를 뜻하며, 라이터는 유사도 대신 「질의에 적힌 표기와 일치」를 적는다.
