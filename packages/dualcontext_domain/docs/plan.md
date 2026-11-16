# 컨텍스트 계획기

`planContext(query, options)` (`src/server/plan/index.ts#planContext`) — 질의를 컨텍스트 아이템 DAG 로 분해하고 종단점부터 만든다.
계약 타입: `src/common/model/plan/index.ts`(`ContextPlanConfig`, `PlanItem`, `PlanTrace`, `PlanStop` …), 포트: `src/server/plan/ports.ts`(`PlanPorts`, `PlanOptions`, `PlanProgress`, `ItemBuild`, `Provided`). 둘은 앱 · 관리자 API · 프런트와 공유하는 확정 계약이다.

## 흐름

| 순서 | 단계 | 폴더 | 실패 처리 |
| --- | --- | --- | --- |
| 1 | `ports.analyze` → 중복 정리 → top 아이템(level 1) | `seed/` | 던지면 그대로 던진다. 아이템 0개 → `stop=no-items`, `context=""` |
| 2 | 단계 루프: 아이템마다 `ports.prerequisites`(단계 안 병렬) → 중복 정리 → 새 아이템 / 기존 아이템 간선 | `dependencies/` | 그 아이템은 사전 요구 없음으로 본다 |
| 3 | 위상 웨이브 순서로 `ports.build`(웨이브 안 병렬), 사전 아이템 컨텍스트를 `provided` 로 | `build/` | 그 아이템만 `status=error` + `error`, 의존하는 쪽은 그 컨텍스트 없이 진행 |
| 4 | top · built · 비지 않은 아이템만 `## 이름` 섹션으로 조립 | `assemble/` | 없으면 빈 문자열 |
| 5 | `mode=decompose` → `stop=mode-decompose`. `reevaluate` → 재평가 루프 | `reevaluate/` | 아래 |

## graph

`src/server/plan/graph/index.ts`. 순수 로직: `normalizeName`(NFKC · 소문자 · 공백과 흔한 구두점 `\p{P}` 제거. 기호 `\p{S}`(`+` 등)와 `# & % @ *` 는 보존 — `C++` · `C#` · `C` 는 다른 키), `addItem`(id `i1, i2 …`), `addEdge`(자기 자신 · 중복 · 순환 거부, 걸었으면 true), `reaches`, `computeWaves(ids)`(부분집합 밖 needs 는 이미 만들어진 것으로 본다).

## dedupe

`src/server/plan/dedupe/index.ts#dedupeCandidates`. 이름 정규화는 언제나 적용한다(그래프에 같은 정규화 이름이 둘 생기지 않게). `dedupe=llm` 이면 `ports.dedupe` 의 `groups` · `existing` 을 그 위에 합친다(범위 밖 인덱스 · 없는 id 는 버림). 던지면 이름 정규화만 쓴다. 묶음 안 하나라도 기존 아이템과 같으면 묶음 전체가 그 아이템이다.

## seed

`src/server/plan/seed/index.ts#seedTopItems`. top 후보를 넣는다: 기존 top(컨텍스트 있음)과 같으면 버림, 기존 비top 과 같으면 top 승격(built 면 재생성 없음), 같은 기존 아이템이 `status` error/empty 면 `rebuild` 로 돌려준다(승격과 겹칠 수 있다). 새 것은 `maxCreate` 와 넘겨받은 아이템 상한을 넘지 않게 만든다. 질의 분석은 `maxCreate=maxItems` · 상한 `maxItems`, 보강은 `maxCreate=maxNewItems` · 상한 라운드 예산(아래 reevaluate).

## dependencies

`src/server/plan/dependencies/index.ts#expandDependencies`. 단계 `2..maxLevels`, 새 아이템이 없으면 즉시 끝. `maxLevels=1` 이면 호출 없음. 아이템당 후보는 `maxNeedsPerItem` 에서 자른다. 아이템 수가 넘겨받은 상한(최초 계획 `maxItems`, 보강 라운드는 라운드 예산)이면 새로 만들지 않지만 기존 아이템 연결은 건다. 단계마다 `trace.levels` 에 `{ level, analyzed, candidates, created, linked, failed? }`(`linked` = 기존 아이템으로 새로 건 간선 수, `failed` = 그 단계에서 `prerequisites` 가 던진 아이템 `{ item: 아이템 id, error }`, 없으면 필드 생략. 그 아이템은 사전 요구 없음으로 진행). 보강 라운드의 단계도 같은 배열에 이어 붙는다.

**`maxLevels` 의 정의: 분석 반복 횟수**(질의 분석 1회 + 사전 요구 분석 `maxLevels-1` 회). DAG 경로 깊이의 상한이 아니다 — 기존 아이템으로 간선을 걸어 경로가 `maxLevels` 보다 깊어지는 것은 허용한다(예: 보강 아이템이 이미 3단계 사슬의 머리에 의존).

## build

`src/server/plan/build/index.ts#buildItems`. `provided` = needs 순서의 사전 아이템 중 `status=built` 이고 컨텍스트가 비지 않은 것. 빈 컨텍스트 → `status=empty`.
앱의 `ports.build` 가 쓰는 `augmentQuery(query, ports, provided)`(`src/server/augment/index.ts#augmentQuery`)는 비지 않은 `provided` 가 있으면 조사원 · 자료가 없어도 라이터를 부른다(batch: 쌍 전체로 1회 — 빈 배열이면 `writeContext` 는 사전 컨텍스트 섹션만 낸다, per_pair: 쓸모 있는 쌍이 없으면 빈 쌍 배열로 1회). 그래서 A→B 에서 B 에만 자료가 있어도 A 는 비지 않는다. `provided` 가 없거나 모두 비면 classic 과 같다. 실제 실행 웨이브를 `trace.waves` 에 이어 붙인다(첫 계획 + 보강 라운드).

## assemble

`src/server/plan/assemble/index.ts#assembleContext`. 사전 아이템 컨텍스트는 의존하는 아이템에 녹아 있으므로 싣지 않는다.

## reevaluate

`src/server/plan/reevaluate/index.ts#reevaluateLoop`. 라운드 r: 조립 → `answer` → `evaluate` → 통과(`score >= passScore && missing.length <= maxMissing`, `pass` 는 플래너가 다시 계산)면 `passed`.
불통과면 차례로: `r >= maxRounds` → `max-rounds`, missing 없음 → `no-missing`, 보강(seed) 결과 새 아이템 · 승격 · 재빌드가 모두 없음 → `no-new-items`.
**아이템 예산:** `maxItems` 는 최초 계획의 상한이다. 보강 라운드는 별도 예산 `roundItemBudget` = 라운드 시작 시점 아이템 수 + `maxNewItems × (1 + maxNeedsPerItem)` 을 seed · dependencies 의 아이템 상한으로 쓴다(새 top 은 `maxNewItems` 개까지, 그 사전 아이템은 남은 예산 안에서, 넘는 후보는 버림). 라운드마다 새로 계산하며 누적 상한은 없다 — 바깥 한도는 `maxRounds`.
새 아이템은 `round=r+1`, 그 사전 의존성을 `maxLevels` 로 분석하고 새 것만 build(기존 아이템 컨텍스트 재사용, 기존에 의존하면 `provided`). `rounds[r].addedItemIds` = 이 라운드 보강으로 새로 만든 top 아이템과 그 사전 아이템(재빌드 · 승격은 빠진다).
다시 요구된 기존 아이템이 error/empty 면 `pending` 으로 되돌려(context · pairs · error · ms 초기화) 새 아이템과 같은 웨이브 계산으로 다시 build 한다. 보강 라운드 안에서만 일어나므로 한 아이템의 재빌드는 최대 `maxRounds` 번이다.
`answer` 실패 → `rounds[r].answer.error` + `stop=answer-failed`, `evaluate` 실패 → `rounds[r].evaluationError` + `stop=evaluation-failed`. `trace.answer` = 마지막으로 성공한 답변.

## 설정 중 플래너가 쓰지 않는 것

`ContextPlanConfig.maxProvidedChars`(500~20000)는 앱 어댑터의 `ports.build` 가 `provided` 각 컨텍스트를 앞부분만 자를 때 쓴다. 플래너는 `provided` 를 자르지 않고 그대로 건네며, 실행 기록을 위해 `trace.limits.maxProvidedChars` 에만 싣는다.

## 진행 알림

`options.onProgress` 순서: `analyze`, `dependencies`, 웨이브마다 `build`, 라운드마다 `answer` · `evaluate`(· `reinforce` · `dependencies` · `build`), 끝으로 `done`(detail=stop). 알림이 던져도 계획은 계속된다.

## 동시성

같은 웨이브 build 와 같은 단계 prerequisites 는 `Promise.all`. 모델 동시성 제한은 앱 어댑터가 한다.
