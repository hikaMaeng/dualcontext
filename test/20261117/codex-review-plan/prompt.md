저장소 F:\dev\dualcontext 의 미커밋 변경(git status 로 확인, git diff + 신규 파일)을 코드 리뷰하라. 코드를 고치지 말고 지적만 하라.

## 변경 개요
"컨텍스트 계획기" 추가. 질의 → 컨텍스트 아이템 분석 → 단계별 사전 의존성 분석(maxLevels) → 중복 정리 → 종단점부터 웨이브(병렬) 빌드(사전 컨텍스트를 provided 로 전달) → top 아이템만 조립 → (reevaluate 모드) 답변·평가·부족 아이템 보강 루프. 모드: classic(기존, 기본) | decompose | reevaluate.

## 수용 기준(사용자 요구 원문 요지)
- 의존성은 DAG: 한 아이템이 여러 사전 아이템에, 한 사전 아이템이 여러 아이템에 연결. 중복은 단일 아이템으로 정리하고 의존성도 정리.
- 단계 수 상한 설정, 그 전에 의존성이 끝나면 강제로 하지 않는다.
- 종단점부터 역으로 컨텍스트 생성, 의존성에 따라 제공. 최종적으로 1차 아이템만 컨텍스트로 남는다.
- 재평가: 부족하면 필요한 컨텍스트를 추출해 같은 방식으로 의존성 분석·구축 후 재답변. 최대 횟수와 통과 조건 설정 가능.
- classic 모드는 기존과 동일하게 동작(회귀 금지).

## 대상 파일
packages/dualcontext_domain/src/server/plan/** (graph, dedupe, seed, dependencies, build, assemble, reevaluate, index), packages/dualcontext_domain/src/server/augment/index.ts 와 write/index.ts 의 provided 추가분,
apps/dualcontext/src/server/plan/** (prompts, parse, ports, config), apps/dualcontext/src/server/augment/{index.ts,base/index.ts}, admin/runs/lifecycle/index.ts, admin/plan/index.ts, answer/index.ts, writer/index.ts, mcp/tools/augment, apps/dualcontext/docker/initdb/007_plan.sql.

## 특히 볼 축
1. 그래프: 순환/중복 간선, 자기 참조, 이름 정규화 충돌, 위상 웨이브 계산 오류, 승격(top) 처리.
2. 상한 우회: maxItems / maxLevels / maxNeedsPerItem / maxNewItems / maxRounds 가 어디서든 뚫리는 경로.
3. 동시성: 같은 웨이브 병렬 build 중 공유 상태(아이템 이름+설명 키로 원본 결과를 기록하는 어댑터 맵 등) 경합·충돌·누수, runAugment 호출 간 상태 공유.
4. 실패 격리: build/answer/evaluate/prerequisites 실패가 전체를 죽이거나 조용히 잘못된 결과를 내는 경로.
5. 프롬프트 주입: 크롤링/조사원 자료가 아이템 분석·평가 프롬프트로 들어가 JSON 구조를 오염시킬 수 있는지, JSON 파서의 견고성.
6. SQL(007_plan.sql) 멱등성과 augment_runs 트리거(005)와의 상호작용.
7. classic 회귀: 기본 모드에서 기존 경로·기존 시그니처가 달라진 곳.
8. 실행 로그 plan/planProgress 기록 경합.

## 출력 형식
발견마다: `파일:라인 / 무엇이 틀렸나 / 어떤 입력에서 깨지나 / 심각도(높음·중간·낮음)`. 확실한 것과 추측을 구분하고, 심각도 순으로.
