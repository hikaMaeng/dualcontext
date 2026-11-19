# 코덱스 리뷰 의뢰: dualcontext 통합 수정 전략 검토 (설계 리뷰, 코드 수정 금지)

## 0. 맨 앞 지시: 실코드 병행 검증 (필수)
이 의뢰서의 모든 사실 주장은 이번 회차에 **저장소 소스를 직접 열어** 대조하라. 각 주장에 `정확 / 부정확 / 근거불일치` 를 붙이고, 이전 판정이나 문서 요약을 재사용하지 마라. 지적마다 `파일:라인` 근거를 달아라. 저장소: F:\dev\dualcontext (TypeScript, npm workspaces). 주 대상: `apps/dualcontext/src/server/**`, `packages/dualcontext_domain/src/server/**`. 코드를 고치지 말고 지적만 하라.

## 1. 사용자 요구 (원문 그대로)
- "통합하여 최적 코드로 만들어야해. 뭘 먼저하는 문제가 아니야 동시성과 취소는 cpu블로킹과 밀접해. 이걸 나눈거 부터 너의 전략이 의심스러워"
- "특히 cpu블록킹"
- "그 안에서도 당연히 목표는 성능을 높이는 것이다. 인퍼런스의 병렬성을 희생해서는 안된다"

## 2. 최상위 제약(수용 기준)
**성능을 높인다. 추론(LLM·임베딩) 서버로 나가는 요청의 병렬성과 처리량을 줄이는 변경은 허용되지 않는다.** 구체적으로:
1. 추론 서버로 나가는 동시 요청 수를 설계가 임의로 낮추지 않는다(실행별 몫 제한, 낮은 고정 실행 수 상한, 한 실행 직렬화 금지).
2. 스케줄링은 **작업 보존형(work-conserving)** 이어야 한다: 대기 중인 요청이 있는데 슬롯이 노는 일이 없어야 한다. 공정성은 경합 시 순서만 바꿀 뿐 슬롯을 비우지 않는다.
3. 이벤트 루프가 막혀 LLM 호출 발행이 늦어지는 것도 병렬성 손실로 본다(제거 대상).
4. 취소·시한은 낭비 작업을 없애 처리량을 늘리는 용도이며, 정상 진행 중인 작업을 느리게 해서는 안 된다.

## 3. 이미 확인한 현황 (내가 코드에서 직접 읽은 것 = [확인], 감사 에이전트 보고만 받은 것 = [보고])
- [확인] `apps/dualcontext/src/server/model/index.ts:11` 채팅 제어 기본값 `maxConcurrent: 3, attempts: 4, idleMs 600000, totalMs 3600000`. 제한기 `createLimiter(control.maxConcurrent)` 는 `createModelClient` 호출마다 새로 만들어진다(`:24`) → 프로세스별. 대기 큐 무한, 큐 대기에는 시한·신호 없음 (`model/limit/index.ts`).
- [확인] 503/429 만 재시도(`model/limit/index.ts:21-31`, 백오프 2·4·8초). 그 바깥 `plan/ports/index.ts:45-55` `withAttempts` 가 모든 오류에 대기 없이 4회 재시도(파싱 실패 포함, temperature 0 동일 프롬프트) → 논리 호출당 최대 HTTP 16회.
- [확인] MCP stdio 는 별도 프로세스(`server/index.ts:23-27`: `--stdio` 면 풀·모델 클라이언트를 새로 만들어 직접 엔진 실행). HTTP 서버와 MCP stdio 프로세스가 각자 limiter 를 가져 전체 동시성이 합산되지 않는다.
- [확인] 취소 수단 없음: `startRun`(`admin/runs/lifecycle/index.ts:163`) 이 `execute` 를 백그라운드로 돌리고 `AbortSignal` 은 어디에도 전달되지 않는다. MCP 클라이언트가 떠나도 실행은 끝까지 돈다(실측으로 확인한 바 있음: 지연 실행이 정상 완료).
- [확인] `publish()` 는 구독자 유무와 무관하게 `readRun`(전체 행) 을 읽는다(`lifecycle/index.ts:30-33`). SSE 는 2초마다 `readRun` 후 `JSON.stringify` 로 중복 검사(`admin/runs/index.ts:70-78`).
- [확인] `createTraceSaver.push` 가 단계마다 `JSON.stringify(trace)` 동기 실행(`lifecycle/index.ts:95`), `createNodeSaver` 가 `JSON.parse(JSON.stringify(patch))` 깊은 복사(`admin/runs/nodes/index.ts:49`).
- [확인] 코드베이스 색인 `readIndex` 가 질의마다 최대 64MB `JSON.parse`(`collect/codebase/store/index.ts:22`), `projects` 모드에서 프로젝트마다 `hasIndex`+`acquireIndex` 로 이중 파싱(`collect/codebase/projects/index.ts:46,55`), 검색기 캐시 `cacheLimit = 8`(`collect/codebase/rank/index.ts:16`).
- [확인] robots.txt 규칙을 `new RegExp` 로 변환해 원격 경로에 동기 실행(`collect/crawler/robots/index.ts:51-56`). 감사 에이전트 실측: `/*a*a*a*a*a*a*a*b` 규칙 + `a` 2000자 경로 → 170초 이상 미종료 [보고, 시간은 미검증].
- [확인] import 정규식이 `^\s*…` + `m` 플래그로 파일 전체에 적용(`collect/codebase/symbols/languages.ts:32,44,57,71,80,124`). 심볼 정규식만 줄 400자 제한이 있다(`symbols/index.ts:43`). 개행 5만 줄 1.7초, 200KB 개행 약 28초 추정 [보고].
- [확인] 크롤러 검색이 청크(≤3000)의 임베딩 전부를 SELECT 해 JS 코사인(`collect/crawler/store/index.ts:145-153`), 임베딩 컬럼 `double precision[]`.
- [확인] `005_runs_search.sql:38-41` 트리거가 답변·컨텍스트 저장마다 mecab `to_tsvector` 재색인(필드당 최대 20만 자).
- [보고] 계획 엔진: 기본값 reevaluate 최악 호출 수 계획 72(전부 실패 시 288) + build 56건×A(≤9). 취소·전체 시한 없음. 프롬프트 컨텍스트 상한 없음. `extractJson` O(n²) 가능(`plan/parse/index.ts:50-64`). rebuild 상한 없음(`reevaluate/index.ts:94-117`).
- [보고] 폴더 조사원이 질의마다 최대 300파일×1MB 를 읽어 DB 로 보내 `to_tsvector` 2회(`collect/folder/index.ts`). 크롤 첫 실패 시 질의마다 재크롤(백오프 없음, `collect/crawler/index.ts:55-57`). 코드베이스 갱신이 프로젝트별 동시 실행.
- [보고] 프론트: 노드 문서 4초 폴링이 실행 전체가 진행 중이면 끝난 노드도 계속, 숨은 탭도 폴링, 새 창마다 독립 SSE.

## 4. 제안 전략 (하나로 통합된 설계; 순서 문제가 아님)
핵심 논지: **동기 CPU 작업은 취소·시한·동시성 제어를 모두 무력화한다**(이벤트 루프가 멈추면 타이머·신호·큐가 돌지 못하고 LLM 호출 발행도 지연). 그래서 (a) 모든 실행에 신호/시한을 관통시키고, (b) 실행을 단일 프로세스가 소유하게 하며, (c) CPU 작업은 선형 알고리즘으로 바꾸거나 종료 가능한 워커로 격리한다. 세 가지는 한 설계의 부분이다.

### A. 실행 컨텍스트 (신호·시한)
- `startRun` 이 실행별 `AbortController` 와 시한을 만들고, `Deps` 를 `{...deps, signal}` 로 복사해 `runAugment` → `createPlanPorts` → `augment/base` → 조사원(`collect/*`) → `model.chat/embed(…, {signal})` 까지 관통시킨다. 도메인 플래너 `PlanOptions` 에 `signal` 을 추가해 레벨·웨이브·라운드 경계에서 `signal.aborted` 를 확인한다.
- 시한 도달 시: 계획 모드에서 이미 조립된 컨텍스트가 있으면 `coverage=partial` 로 반환, 없으면 오류. 시한 기본값은 effort 별 설정값(제안: light 5분 / middle·high·xhigh 는 설정, 기본 예산 미정 — 리뷰어 의견 요청).
- 중요: 시한·취소는 **진행 중이던 작업이 슬롯을 계속 쓰는 낭비를 없앨 뿐**, 정상 실행의 동시성에는 관여하지 않는다.

### B. 단일 엔진 프로세스 + 작업 보존형 스케줄러
- MCP stdio 프로세스는 엔진을 직접 돌리지 않고 같은 컨테이너의 HTTP 서버(`127.0.0.1:<port>`)로 중계한다(클라이언트 설정 `docker exec … --stdio` 불변). 서버가 실행 레지스트리 `Map<runId, AbortController>` 를 소유하고, 중계 요청의 연결이 끊기면(MCP 취소 알림 `extra.signal` → fetch abort → 서버 `request.on('close')`) 해당 실행을 abort 한다.
- 추론 호출 게이트웨이를 서버에 **하나**만 둔다. 이것이 처음으로 전역 limiter 가 된다.
  - **동시 상한은 고정 3이 아니라 설정값(`ai_server` 설정 또는 env)이며, 추론 서버 용량에 맞춘다.** 503/429 시에만 상한을 줄이고(AIMD 식 감소), 성공이 이어지면 설정 상한까지 서서히 올린다. 기본값은 현재 3 이상으로 시작하며 현재보다 낮추지 않는다.
  - 큐는 작업 보존형: 슬롯이 비면 항상 즉시 다음 요청을 내보낸다. 공정성은 실행 간 라운드로빈으로 순서만 정한다. **실행별 몫 상한을 두지 않는다.**
  - 큐 대기도 `signal`·시한에 반응해 즉시 빠진다(취소된 실행의 대기 요청이 슬롯을 낭비하지 않게).
- 실행 수 자체에는 낮은 상한을 두지 않는다. 메모리 보호용 매우 높은 안전 상한만 둔다(초과 시 즉시 busy 오류). 실행들은 서로 병렬로 진행한다.
- 재시도는 게이트웨이 한 층으로 합친다: 일시적 오류(네트워크, 502/503/429, 유휴 타임아웃)만, 지수 백오프+지터, 신호에 반응하는 sleep, 슬롯을 쥔 채 sleep 하지 않는다(슬롯 반환 후 대기). 파싱 실패(temperature 0 동일 프롬프트)는 재시도하지 않고 해당 아이템 실패로 격리. 스트림 누적 응답 문자 상한을 둔다.
- stdio 중계 방식 때문에 바뀌는 동작: 현재 "클라이언트가 떠나도 서버 작업은 계속된다(취소 불가)"가 "클라이언트가 떠나면 취소된다"로 바뀐다. MCP SDK 기본 요청 제한 60초에서 middle 이상(수십 분)은 전부 취소된다 → 완화책으로 서버가 실행 진행 이벤트를 MCP progress 알림으로 전달해 `resetTimeoutOnProgress` 를 쓰는 클라이언트가 기다릴 수 있게 한다. 이 변경의 타당성을 검토해 달라.

### C. CPU 작업: 선형화 우선, 나머지는 종료 가능한 워커
- 선형 알고리즘으로 교체(워커 불필요): robots 패턴 매칭(정규식 제거, 와일드카드 선형/탐욕 매칭), import 추출(파일 전체 `m` 정규식 → 줄 단위 + 줄 길이 상한), 크롤러 제목 정규식(줄 길이 상한/비정규식), `extractJson`(단일 패스 스캐너), 스트림 응답 상한.
- `node:worker_threads` 풀(크기 ≤ cpus-1, 최소 1)로 격리: 코드베이스 색인 로드·검색(워커 안에 파싱된 색인과 BM25 검색기를 캐시, 메인에는 topK 자료만 전달 → 64MB 구조화 복제 회피, 이중 파싱 제거), 색인 빌드(스캔·심볼·그래프), 크롤러 코사인, 사용자 지정 include/exclude 정규식(+대상 길이 상한 2048). 워커 작업은 `signal`/시한 시 `worker.terminate()` 로 즉시 종료하고 풀이 지연 재생성한다. 워커는 LLM 호출 발행 경로(이벤트 루프)를 막지 않는 것이 목적이다.
- 반복 직렬화 제거: trace 저장은 시간 기반 합치기(≥1초, 마지막 값 우선, 종료 시 최종 기록), 노드 patch 깊은 복사 제거(얕은 병합), `publish` 는 구독자가 있을 때만 `readRun`, SSE 는 단일 프로세스가 되므로 DB 2초 폴링 제거하고 bus 이벤트(≥500ms 합치기)로만 푸시. mecab 트리거는 test 실행의 답변 2회 저장을 1회로 줄이거나 변경된 필드만 재계산.

### D. 부하 감소 (병렬성 영향 없음)
- 폴더 조사원 총 바이트 상한·DB 전송량 감소, 크롤 실패 백오프, `embedPending` 단일 비행, 코드베이스 갱신 전역 동시 1(메모리 보호; 단 질의 경로는 막지 않음), 검색기 캐시 크기를 프로젝트 수에 맞춤, DB 풀 4 → 상향 + `connectionTimeoutMillis`/`statement_timeout`, 헬스체크가 풀 대기에 걸리지 않게 분리, SIGTERM 에서 실행 전부 abort + `closeAllConnections`, `dualcontext` 컨테이너 메모리·CPU 제한과 로그 크기 제한, 프론트 숨은 탭 폴링 중지·끝난 노드 폴링 중지·AbortController.

### E. 검증 계획
- 단위/회귀: 취소(응답 없는 가짜 모델 → abort 후 N ms 안에 종료, 슬롯 반환), 작업 보존형 큐(슬롯 놀지 않음, 취소된 대기 요청 제거), 재시도 단일화(HTTP 횟수 상한), ReDoS 회귀(시간 상한 단언), 워커 terminate 후 풀 복구, 시한 partial 반환.
- 성능: 변경 전후 동일 질의로 (1) 동시 호출 N개일 때 추론 서버 in-flight 평균/최대(병렬성 비교), (2) 호출당 지연, (3) 이벤트 루프 지연(`perf_hooks.monitorEventLoopDelay`) 을 같은 조건에서 비교하고, 병렬성이 떨어지면 불합격.
- 기존 배포·헤드리스 검증·테스트 문서·커밋 규약 유지.

## 5. 리뷰어에게 요청하는 검토 축 (우선순위 순)
1. **병렬성 위반 탐색**: 위 전략 중 추론 병렬성/처리량을 줄이거나 슬롯을 놀리게 만들 수 있는 부분(큐 정책, AIMD, 단일 프로세스 중계, 워커 풀, 합치기/스로틀, 재시도 변경 등)을 코드 근거와 함께 찾아라. 특히 "단일 게이트웨이가 병목이 되는가", "중계 HTTP 홉이 지연·동시 연결에 제한을 거는가(Node/undici/Express 소켓·keep-alive 상한)", "AIMD 가 오히려 상한을 낮추는 위험", "라운드로빈이 작업 보존형인가".
2. **취소 정합성**: `AbortSignal` 이 닿지 않는 경로(도메인 패키지 포트 경계, `pg` 쿼리, 동기 구간, `Promise.all` 중간, `undici` 스트림, 자식 프로세스 git)와, 취소 뒤 DB 행 상태·노드/trace 저장기 `settle`·`publish` 정리의 경쟁 조건.
3. **워커 격리의 실현성**: 워커로 옮긴 코드의 입출력 구조화 복제 비용, 워커 안 캐시와 terminate 의 상호작용, `node:worker_threads` 가 빌드 산출물(`dist`) 경로·ESM·TypeScript 빌드와 맞는지(`package.json`, `tsconfig`, 빌드 스크립트 확인), 워커 풀 크기와 DB/pgvector 접근.
4. **단일 프로세스 중계(stdio→HTTP)의 위험**: 서버 미기동 시 동작, 컨테이너 재시작, 인증 없는 내부 엔드포인트 노출(루프백만), MCP SDK 의 취소/진행 알림 API 가 실제로 그렇게 동작하는지(`@modelcontextprotocol/sdk` 버전 확인), 기존 stdio 직접 실행 대비 회귀.
5. **누락**: 이 전략이 놓친 자원 문제, 더 단순한 대안(예: 중계 대신 DB 어드바이저리 락 기반 전역 슬롯), 과설계 부분.
6. 슬라이스 분할: 한 설계지만 안전하게 나눠 배포하려면 어떤 경계가 의존성상 안전한가(순서가 아니라 의존 관계로).

## 6. 출력 형식
발견마다: `파일:라인 / 무엇이 틀렸나(또는 위험한가) / 어떤 입력·상황에서 깨지나 / 심각도(높음·중간·낮음) / 병렬성 영향 여부(있음·없음)`. 의뢰서의 사실 주장 검증 결과(정확/부정확/근거불일치)를 별도 표로 먼저 제시. 코드를 고치지 마라.
