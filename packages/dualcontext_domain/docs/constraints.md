# Constraints

* This is the only domain package for `apps/dualcontext`.
* Do not create another domain-related package for the same app.
* Do not import from `apps/`.
* Keep domain invariants here instead of in app lifecycle wiring.
* Keep non-domain shared packages cohesive and standalone.

## 소비자 · 불변식

| 표면 | 소비자 | 불변식 |
| --- | --- | --- |
| `AugmentPorts.writer.write(query, pairs, provided?)` · `writeContext(…, provided?)` | 앱 `writer/index.ts#createWriter` · 계획기 어댑터 | `provided` 가 없으면 이전과 같은 호출 · 같은 글(classic 회귀 0). 세 번째 인자는 선택이다. |
| `AugmentPair.item?` · `Answer.fromPlan?` (`common`) | 앱 실행 로그 · 프런트 | 선택 필드. classic 결과에는 없다. `item` 은 계획 아이템 이름, `fromPlan` 은 reevaluate 마지막 라운드 답변을 증강 후 답변으로 재사용했다는 표시. |
| `planContext` · `PlanPorts` (`dualcontext_domain/server`) | `apps/dualcontext` 어댑터 | 포트 시그니처와 `PlanTrace` 모양은 앱 · 관리자 API · 프런트와 공유하는 확정 계약이다. 바꾸면 세 곳이 깨진다. `trace.items` 는 id 순, `trace.waves` 는 실제 build 순서. |
