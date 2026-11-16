# Internals

The scaffold starts with a minimal common export so build, lint, and test tasks
have a concrete package contract.

Add internals only when implementation details affect future maintenance.

## 결정 · 불변식 (컨텍스트 계획기, `src/server/plan`)

* 이름 정규화는 `dedupe=llm` 일 때도 적용한다 — 그래프에 같은 정규화 이름이 둘 생기면 `findByName` 이 모호해진다.
* `addEdge` 는 순환을 거부한다 — 그래서 `computeWaves` 는 언제나 끝나고 결과는 DAG 다.
* 보강 라운드는 새 아이템만 build 한다 — 기존 아이템의 needs 는 build 뒤 바뀌지 않으므로(새 간선은 새 아이템에서만 나간다) 기존 컨텍스트를 재사용해도 맞다.
* prerequisites 실패는 계획을 죽이지 않는다(그 아이템은 사전 요구 없음, `levels[].failed` 에 기록) — 계약은 analyze 만 던지라고 정했다.
* 답변 실패와 평가 실패는 stop 을 나눈다(`answer-failed` / `evaluation-failed`) — 실행 로그에서 어느 모델 호출이 깨졌는지 구분한다.
* 이름 정규화는 `+` · `#` 등을 보존한다 — `C++` · `C#` 이 `c` 로 합쳐지는 오병합이 리뷰에서 확인됐다.
* 다시 요구된 error/empty 아이템은 재빌드한다(버리지 않는다) — 일시 실패가 계획 끝까지 남지 않게. 보강 라운드 안에서만이므로 횟수는 `maxRounds` 로 묶인다.
* `maxLevels` 는 분석 반복 횟수다 — 기존 아이템 연결로 DAG 경로가 더 깊어지는 것은 허용한다(깊이를 막으면 공유 사전 아이템 재사용을 버려야 한다).
* 비지 않은 `provided` 만으로도 `augmentQuery` 는 라이터를 부른다 — A→B 에서 B 에만 자료가 있으면 A 가 비어 최종 컨텍스트가 ""가 되던 결함(리뷰 지적) 때문.
* `maxItems` 는 최초 계획에만 적용하고 보강 라운드는 라운드마다 `시작 아이템 수 + maxNewItems×(1+maxNeedsPerItem)` 예산을 쓴다(`src/server/plan/reevaluate/index.ts#roundItemBudget`) — 실서버 시험에서 최초 계획이 maxItems(16)를 다 써 평가가 부족 4개를 지적해도 보강이 새 아이템을 못 만들었다(added=[]). 바깥 한도는 `maxRounds`.
