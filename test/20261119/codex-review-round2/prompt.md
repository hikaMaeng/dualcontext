# 코덱스 리뷰 2회차: dualcontext 실행 모델 설계 v3 (큐와 소비자) 검토 (설계 리뷰, 코드 수정 금지)

## 0. 맨 앞 지시: 실코드 병행 검증 (필수)
`apps/dualcontext/docs/execution-design.md`(v3)의 모든 사실 주장과 **구현 가능성**을 이번 회차에 저장소 소스와 설치된 의존성(`node_modules`의 `@modelcontextprotocol/sdk`, `undici`, `pg`, `express`, `esbuild`)을 직접 열어 대조하라. 이전 회차(`test/20261119/codex-review-strategy/report.json`)의 판정을 재사용하지 마라. 각 주장에 정확/부정확/근거불일치를 붙이고 지적마다 `파일:라인` 근거를 달아라. 코드를 고치지 말고 지적만 하라.

## 1. 사용자 요구 (원문)
- "통합하여 최적 코드로 만들어야해. 뭘 먼저하는 문제가 아니야 동시성과 취소는 cpu블로킹과 밀접해."
- "특히 cpu블록킹"
- "그 안에서도 당연히 목표는 성능을 높이는 것이다. 인퍼런스의 병렬성을 희생해서는 안된다"
- "음 리뷰 방향이 이상해 왜냐면 용량이 아니라 큐 개념이기 때문이다. 큐에 담고 워커가 가져가는 동시성인 셈이지"
- "따라서 큐에는 순차적으로 모든 요청을 담아도 무방하다. 부하는 워커만큼만 걸릴테니"
- "코덱스 리뷰를 받고 피드백하는 과정을 2번더 진행. 그 이후 묻지말고 구현" (이번이 추가 2회 중 1회차)

→ 따라서 **용량 제한기/슬롯/admission 이 아니라 "큐 + 소비자(pull)" 모델**로 판단하라. 큐는 모든 요청을 받는다(길이 상한·거절 없음). 부하 상한은 소비자 수다. 1회차 리뷰의 "용량", "슬롯", "AIMD", "작업 보존형 dispatch" 지적은 이 모델에서 어떻게 해소/변형되는지 새로 판정하라.

## 2. 수용 기준 = 문서 "최상위 제약" 4항 (추론 병렬성·유효 처리량 비열화, 쉬는 소비자가 없음, 이벤트 루프 발행 지연 제거, 취소·시한은 정상 작업을 느리게 하지 않음).

## 3. 1회차 리뷰의 지적(20건) 요지와 v3 대응 — 해소 여부를 코드·문서로 판정하라
1. 전역 게이트웨이 용량 축소(9→3, 임베딩과 채팅 합산) → v3: 큐/소비자 자원별 분리, 채팅 소비자 6·임베딩 16.
2. AIMD 로 정상 용량 하락 → v3: 자동 감소 없음, 계측만.
3. 작업 보존성은 dispatch/백오프 분리 → v3: pull 구조 + 지연 재투입(백오프가 소비자를 점유하지 않음).
4. `request.on("close")` 로 정상 POST 취소 → v3: `response.on("close") && !writableEnded`.
5. MCP progress 가 충분조건 아님 → v3: 단조 증가 progress, 제한 사항 문서화.
6. `transport.onclose` 덮어쓰기·요청 ID 0 → v3: 체인, 회귀 시험.
7. 중계의 타임아웃·노출 경계 → v3: 전용 dispatcher, 게시하지 않는 내부 listener, 폴백 없음.
8. 신호 타입만으론 관통 안 됨 → v3: 실행 바인딩 모델 façade(큐에 runId+signal 자동 부착) + RunAborted 재던짐.
9. partial 과 취소 혼동 → v3: 시한/취소/종료 분리, 정리 전용 예산.
10. light 5분 시한 → v3: 선택 예산, 기본 없음.
11. DB 취소·종료 기록 생명주기 → v3: flush→종료→publish 순서.
12. 공유 작업을 한 실행 신호에 종속 → v3: detach, embedPending 단일 비행 + 텍스트 일치 조건.
13. 워커 엔트리가 빌드에 없음 → v3: esbuild 진입점 추가, dist 단독 검증.
14. 캐시 워커와 terminate 충돌 → v3: cpu.search 협력 취소, cpu.build/regex 만 terminate, 바이트 예산.
15. 크롤러 코사인만 워커로 → v3: DB `embedding::vector <=>`.
16. 전역 1 큐가 질의를 늦춤 → v3: 큐 분리, 질의 필수 우선 당김.
17. 직렬화 합치기 계약 → v3: 표본 계약·허브·revision·종료 즉시 flush.
18. 선형화 범위 → v3: 바이트·프레임·깊이 상한, 의미 보존.
19. 재시도 단일화와 로컬 abort/원격 종료 구분 → v3: 단일 층, 지표 분리.
20. 보관 삭제가 실행 중 행을 지움 → v3: running 제외.
추가: 순차 구간 병렬화(조사원 수집, per_pair writer, 하위 질의 라우팅) — 생산자는 전부 큐에 담기만 한다.

## 4. 특히 봐줬으면 하는 축 (우선순위)
A. **구현 가능성(최우선)**:
 - `embedding::vector <=> …` 가 현재 스키마(`apps/dualcontext/docker/initdb/004_crawler.sql` 의 `double precision[]`, pgvector 0.8.6)에서 실제 동작하는가(캐스트 존재, 차원이 다른 행 혼재 시 오류, 플래너가 필터 전에 거리를 계산할 가능성).
 - 큐 `submit` 이 Promise 를 돌려주는 모델을 `recordModel`(`plan/calls/index.ts`), `Deps`(`augment/base/index.ts`), 도메인 포트(`packages/dualcontext_domain/src/server/plan/ports.ts`), 모델 클라이언트(`model/index.ts`)에 끼워 넣는 범위와 테스트 영향. 현재 `createModelClient` 호출 지점 전부.
 - MCP SDK 1.32.2 의 `extra.signal`, `extra._meta.progressToken`, `extra.sendNotification` 동작과 클라이언트 `resetTimeoutOnProgress` 조건.
 - esbuild 0.28 로 워커 엔트리 추가 출력(`--outdir`, 서버 번들의 `import.meta.url` 기준 경로, `createRequire` 배너 영향)과 컨테이너에 `dist` 만 있을 때 동작.
 - 내부 listener(두 번째 포트)를 같은 프로세스에서 열고 compose 에서 게시하지 않아도 `docker exec` 프로세스에서 닿는지(`docker-compose.yml`, `docker/entrypoint.sh`, `docker/Dockerfile`).
B. **큐/소비자 모델의 결함 탐색**: 소비자 수 설정(채팅 6·임베딩 16·CPU min(2,cpus-1))이 기존 처리량을 낮추는가. 큐 무한 + 라운드로빈 pull 에서 한 실행이 큰 웨이브를 담았을 때 다른 실행의 첫 요청이 굶는가(실행별 하위 큐 pull 구현 방식), 지연 재투입(`notBefore`)과 취소 경쟁, 우선순위 클래스(질의 필수 > 갱신)의 기아, 소비자 비동기 루프가 JSON 파싱 등 동기 후처리로 이벤트 루프를 점유하는 곳, 스트림 가드의 정확성.
C. **종료/취소 정합성**: v3 의 종료 순서가 `lifecycle/index.ts`, `nodes/index.ts`, `createTraceSaver` 의 현재 코드에서 성립하는가. 취소된 `Promise.all` 분기, pg 쿼리 취소(풀 연결 점유), 큐에 담긴 작업의 취소 후 Promise 처리(거부/무시) 의미.
D. **선형화 정확성**: robots 반복형 와일드카드 매칭이 현재 `matches()` 의미와 동치인가·선형인가. import 줄 단위화가 현재 지원 형식(`symbols/languages.ts`)을 놓치지 않는가. `extractJson` 의미 보존.
E. **누락·과설계**: 놓친 자원 문제, 이득 대비 위험이 큰 부분(허브, 표본 trace, 구성요소별 tsvector 열 등), 더 단순한 안.
F. 새 결정 검토: 소비자 기본값(6/16), 시한 기본 없음, MCP 비동기 작업 계약은 범위 밖, 큐 길이 무제한(메모리: 큐 항목에 프롬프트 문자열이 들어 있어 큰 페이로드가 쌓이는 문제 여부).

## 5. 출력 형식
먼저 1회차 지적 20건의 해소 여부 표(해소/부분/미해소 + 근거), 그다음 새 발견: `파일:라인 / 무엇이 틀렸나 / 어떤 입력·상황에서 깨지나 / 심각도 / 병렬성 영향(있음·없음) / 수정 방향`. 마지막에 "구현을 시작해도 되는가" 판정과, 시작 전에 반드시 문서에서 고쳐야 할 항목 목록. 코드를 고치지 마라.
