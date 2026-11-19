이번 회차에 소스와 설치된 의존성을 직접 대조했습니다. 아래 경로는 `F:\dev\dualcontext` 기준이며, 약칭은 다음과 같습니다.

- `A` = `apps/dualcontext/src/server`
- `D` = `packages/dualcontext_domain/src/server`
- `F` = `apps/dualcontext/src/front`
- `SDK` = `node_modules/@modelcontextprotocol/sdk/dist/esm`

**사실 주장 검증**

| 의뢰서 주장 | 판정 | 이번 회차 근거·정정 |
|---|---|---|
| 채팅 기본값: 동시 3, 총 시도 4, 유휴 600초, 총 3600초 | 정확 | `A/model/index.ts:11` |
| limiter는 `createModelClient`마다 생성되므로 프로세스별 | 부정확 | 정확한 단위는 **클라이언트 인스턴스별**이다. 현재 운영 진입점이 프로세스마다 하나 만들므로 현재 구성에서는 프로세스별로 작동한다. `A/model/index.ts:24`, `A/index.ts:17` |
| 대기 큐가 무제한이고 대기 중 신호·시한이 없다 | 정확 | `A/model/limit/index.ts:4–9`. 채팅 타이머는 실제 `streamChat` 시작 후 만들어진다. |
| 503·429만 재시도하며 백오프는 2·4·8초 | 부정확 | 상태 코드와 기준값은 맞지만 **이미 0.75~1.25배 지터가 있다**. 실제 대기는 1.5~2.5초, 3~5초, 6~10초다. `A/model/limit/index.ts:27–28` |
| 바깥 `withAttempts`가 파싱 실패 포함 모든 오류를 즉시 4회 시도 | 정확 | `A/plan/ports/index.ts:45–55`, `:76`, `:90`, `:104`, `:159` |
| 논리 호출당 HTTP 최대 16회 | 정확 | **`withAttempts`로 감싼 계획 호출**에서 4×4다. 모든 chat/embed 호출에 적용되는 수치는 아니다. `A/model/index.ts:75`, `A/plan/ports/index.ts:76` |
| stdio가 별도 엔진·pool·limiter를 갖고 HTTP와 동시성을 합산하지 않는다 | 정확 | `A/index.ts:17–27` |
| 실행 취소 신호가 `startRun`에서 엔진으로 전달되지 않는다 | 정확 | `A/admin/runs/lifecycle/index.ts:163–175`, `A/augment/base/index.ts:11`, `D/plan/ports.ts:44–54` |
| `AbortSignal`이 어디에도 없다 | 부정확 | **실행 취소 신호가 없는 것**이다. 개별 HTTP 제한용 신호는 존재한다. `A/model/index.ts:43`, `A/model/chat/index.ts:35–48`, `A/collect/crawler/client/index.ts:81` |
| MCP 클라이언트가 떠나면 언제나 끝까지 정상 실행된다 | 근거불일치 | 도구가 요청 취소 신호를 무시하는 것은 확인했다. 그러나 transport close에는 종료 코드도 있으므로 모든 이탈을 같은 동작으로 단정할 수 없다. 이전 실측은 이번에 재검증하지 않았다. `A/mcp/tools/augment/index.ts:50–56`, `A/index.ts:27` |
| `publish`가 구독자와 무관하게 전체 상세 행을 읽는다 | 정확 | `A/admin/runs/lifecycle/index.ts:21–32` |
| SSE가 2초마다 조회하고 stringify로 중복을 검사한다 | 정확 | `A/admin/runs/index.ts:57–78`. **구독 연결마다** 타이머가 생긴다. |
| trace push 동기 stringify, node patch JSON 왕복 복사 | 정확 | `A/admin/runs/lifecycle/index.ts:95`, `A/admin/runs/nodes/index.ts:49` |
| `readIndex`가 질의마다 최대 64MB를 파싱한다 | 부정확 | 질의 경로의 반복 파싱은 맞지만 **64MB는 쓰기 제한**이다. 읽기에는 크기 검사 자체가 없다. `A/collect/codebase/store/index.ts:20–23`, `:30–33` |
| projects 모드에서 `hasIndex`와 `acquireIndex`가 이중 파싱한다 | 정확 | 프로젝트 이름을 지정하지 않은 탐색 경로에서 그렇다. 이름을 지정하면 해당 `hasIndex` 순회는 건너뛴다. `A/collect/codebase/projects/index.ts:44–55`, `A/collect/codebase/acquire/index.ts:37–46` |
| 검색기 캐시는 8개다 | 정확 | `A/collect/codebase/rank/index.ts:14–16` |
| robots 규칙이 동기 정규식으로 실행된다 | 정확 | `A/collect/crawler/robots/index.ts:51–55`. 제시된 패턴·경로는 이번 격리 재현에서도 **5초 내 미종료**였다. |
| 같은 robots 입력이 170초 이상 걸린다 | 근거불일치 | 이번에는 5초에서 재현 프로세스를 종료했다. 170초 수치는 확인하지 않았다. |
| import 추출은 파일 전체 `^\s*…/m`, 심볼 추출만 줄 400자 제한 | 정확 | `A/collect/codebase/symbols/languages.ts:32`, `:44`, `:57`, `:71`, `:80`, `:124`; `symbols/index.ts:43` |
| 개행 5만 줄 약 1.7초, 200KB 약 28초 | 정확 / 근거불일치 | 현재 TS import 함수로 개행 5만 개 **1740.7ms**를 재현했다. 200KB·28초 추정은 검증하지 않았다. |
| 크롤 청크 전체 임베딩을 가져와 JS 코사인 계산, 컬럼은 `double precision[]` | 정확 | `A/collect/crawler/store/index.ts:145–153`, `apps/dualcontext/docker/initdb/004_crawler.sql:31`. 3000개는 저장 경로의 상한이지 SELECT의 LIMIT은 아니다. |
| 답변·컨텍스트 UPDATE마다 한국어 FTS를 재계산하고 필드당 20만 자로 자른다 | 정확 | `apps/dualcontext/docker/initdb/005_runs_search.sql:37–49`. query·pairs UPDATE 및 INSERT도 대상이다. |
| 기본 reevaluate 계획 호출 최대 72회 | 정확 | 기본값을 사용한 실제 도메인 함수 재현: analyze 1 + prerequisites 56 + dedupe 9 + answer 3 + evaluate 3 = **72**. `A/plan/config/index.ts:13–23`, `D/plan/dependencies/index.ts:31–60`, `D/plan/reevaluate/index.ts:59–105` |
| 전부 실패하면 계획 호출 288회 | 부정확 | 72×4는 경로가 계속 진행한다는 조건의 시도 수 상한이다. **analyze부터 전부 실패하면 그 자리에서 종료**한다. 또한 HTTP 내부 재시도는 별도로 계산해야 한다. `D/plan/index.ts:59–65`, `A/plan/ports/index.ts:45–55` |
| build 최대 56회 | 부정확 | 56은 해당 조건의 고유 아이템 상한이다. 기존 empty/error 아이템을 다시 요구하는 입력에서 **build 108회**를 실제 도메인 함수로 재현했다. `D/plan/seed/index.ts:40–47`, `D/plan/reevaluate/index.ts:110–122` |
| build당 추론 호출 A≤9 | 부정확 | 일반 상한이 아니다. 개별 조사원 라우터가 병렬 추가되고, 단계 수·분해·쌍별 writer 설정도 호출 수를 바꾼다. `A/routing/index.ts:60–79`, `A/routing/config/schema.ts:13`, `D/augment/index.ts:111–118` |
| 계획 엔진에 실행 전체 취소·시한이 없다 | 정확 | `D/plan/ports.ts:44–54`, `D/plan/index.ts:20–95` |
| 프롬프트 컨텍스트 상한이 없다 | 부정확 | **전체 프롬프트 총량 상한은 없다.** 다만 제공 컨텍스트 하나당 `maxProvidedChars` 제한은 있다. `A/plan/ports/index.ts:110–118`, `:144–155`, `A/plan/config/schema.ts:8` |
| `extractJson`에 O(n²) 입력이 가능하다 | 정확 | 각 여는 괄호에서 남은 문자열을 다시 스캔한다. 닫히지 않는 `[` 반복이 반례다. `A/plan/parse/index.ts:24–43`, `:50–64` |
| rebuild 상한이 없다 | 부정확 | 라운드별 rebuild 개수의 별도 예산은 없지만, 반복은 `maxRounds`에 제한된다. `D/plan/reevaluate/index.ts:90`, `:110–122`; 설정 범위는 `A/plan/config/schema.ts:11` |
| 폴더 조사원이 질의마다 최대 300파일×1MB를 읽고 SQL에 `to_tsvector` 두 번 | 정확 | `A/collect/folder/index.ts:8–9`, `:47–63`. 실제 DB 내부 실행 횟수·시간은 실행계획으로 별도 검증해야 한다. |
| 첫 크롤 실패 뒤 다음 질의가 다시 크롤하며 실패 백오프가 없다 | 정확 | 사용 가능한 청크가 없으면 `finishedAt`과 무관하게 재크롤한다. `A/collect/crawler/index.ts:55–57` |
| 코드베이스 갱신이 프로젝트별로 동시에 가능하다 | 정확 | `inflight`는 키별이다. 다만 projects의 최초 warming 루프 자체는 직렬이다. `A/collect/codebase/acquire/index.ts:10–32`, `projects/index.ts:17–24` |
| 끝난 노드도 실행 전체가 running이면 4초 폴링, 숨은 탭 중지 없음, 창별 SSE | 정확 | 활성화된 노드 상세 훅 기준이다. `F/features/runs/view/workbench/use-node-detail/index.ts:24–46`, `F/lib/run.ts:62–103` |
| MCP SDK 기본 제한은 60초다 | 정확 | 설치·lock 모두 **1.32.2**. 요청 측 기본값이며 모든 MCP 클라이언트의 공통 강제 제한은 아니다. `package-lock.json:612–614`, `SDK/shared/protocol.js:8`, `:740–742` |

제안의 효과에 관한 사실 주장도 구분해야 합니다.

| 제안의 단정 | 판정 | 이유 |
|---|---|---|
| 동기 CPU 블로킹은 이벤트 루프의 취소·타이머·호출 발행을 늦춘다 | 정확 | 위 robots/import 재현과 동기 호출 경로가 뒷받침한다. 다만 이미 원격에서 실행 중인 추론이나 DB 자체 시한까지 멈추는 것은 아니다. |
| 게이트웨이 상한을 3 이상으로 두면 현재 병렬성을 보존한다 | 부정확 | 기존 여러 클라이언트의 합산 채팅 용량과 **limiter가 없는 임베딩**을 보존하지 못한다. `A/model/index.ts:61–75` |
| 라운드로빈이면 작업 보존형이다 | 근거불일치 | 선택 순서만으로 보장되지 않는다. 빈 슬롯을 모두 채우는 dispatch 알고리즘이 필요하다. 제안 구현은 아직 없다. |
| `request.close`는 중계 클라이언트 이탈을 뜻한다 | 부정확 | 정상 요청 본문 완료에도 발생한다. 아래 재현 참고. |
| progress 알림으로 장시간 MCP 호출을 유지할 수 있다 | 정확, 조건부 | 클라이언트의 progress 등록·타이머 갱신 설정·총 제한·알림 간격 조건이 필요하다. `SDK/shared/protocol.js:452–475`, `:671–679`, `:740–742` |
| 워커 terminate는 즉시 종료다 | 부정확 | 비동기 종료 요청이다. 종료 완료를 기다려야 한다. [Node 문서](https://nodejs.org/api/worker_threads.html#workerterminate) |
| 탐욕 와일드카드/단일 패스 스캐너라는 명칭만으로 전체 처리가 선형이다 | 근거불일치 | 구현·복잡도 증명이 없다. 재시도형 탐욕 매칭이나 중첩 후보별 JSON 재파싱은 여전히 반복 비용을 만들 수 있다. |
| D의 변경은 병렬성에 영향이 없다 | 부정확 | cold index 대기, 공유 작업 취소, CPU 제한, DB 경합으로 다음 추론 발행이 늦어질 수 있다. 아래 지적 참조. |

**판정: 통합 방향은 타당하지만, 현재 제안 그대로는 수용 기준을 충족하지 못합니다.** 특히 전역 용량 축소, `request.close` 기반 취소, 취소를 일반 실패로 삼키는 경로는 구현 전에 설계에서 바로잡아야 합니다.

아래의 ‘병렬성 영향 있음’은 직접 동시 상한을 줄이는 경우와 후속 추론 발행·유효 처리량을 떨어뜨리는 경우를 모두 포함합니다.

1. **전역 게이트웨이의 기준 용량이 잘못 잡혀 있습니다.**  
   **근거:** [A/model/index.ts:24](F:/dev/dualcontext/apps/dualcontext/src/server/model/index.ts:24), `:61–75`, `A/index.ts:17–25`.  
   **위험·상황:** HTTP와 stdio 두 개가 각각 채팅 3개를 처리하던 부하를 새 게이트웨이 3개로 합치면 9→3이 됩니다. 임베딩까지 같은 슬롯에 넣으면 긴 채팅이 별도 임베딩 서버의 발행을 막습니다.  
   **수정 방향:** 게이트웨이 소유자는 하나여도 용량 계정은 실제 추론 자원별로 나누십시오. 동일 자원을 공유하는 chat/embed만 함께 계상하고, 서로 다른 서버는 독립적으로 채워야 합니다. 기존 운영 부하의 합산 병렬성을 기준으로 설정해야 합니다. 프로세스 수에 제한이 없는 기존 구조에 대해 “유한 상한이면 항상 동등”이라는 보장은 불가능하므로 비교 부하 범위도 명시해야 합니다.  
   **심각도: 높음 / 병렬성 영향: 있음**

2. **503·429만 보고 AIMD로 상한을 내리면 최상위 제약을 위반할 수 있습니다.**  
   **근거:** `A/model/limit/index.ts:25–28`, `A/model/index.ts:15`, `:26–34`.  
   **위험·상황:** 특정 API 키의 429, 일시 장애 503이 전체 GPU 용량 부족과 같지는 않습니다. 한 오류로 다른 정상 요청의 상한을 내리거나, 긴 추론의 성공을 기다리며 천천히 복구하면 정상 슬롯이 오래 비게 됩니다.  
   **수정 방향:** 이번 계약에서는 자동 용량 감소를 기본 동작으로 승인하기 어렵습니다. 먼저 용량을 유지한 오류별 재시도와 계측을 적용하고, 적응 제어는 별도 검증 대상으로 두십시오. 도입한다면 자원별 격리·감소 하한·복구 조건·동일 장애에서의 처리량 비열화를 증명해야 합니다.  
   **심각도: 높음 / 병렬성 영향: 있음**

3. **작업 보존성은 라운드로빈보다 dispatch·재시도 상태 분리에 달려 있습니다.**  
   **근거:** `A/model/limit/index.ts:6–13`, `A/model/index.ts:75`.  
   **위험·상황:** 현재는 백오프 sleep도 슬롯 안에서 실행됩니다. 새 구조에서 실행당 한 번만 dispatch하거나, 백오프 중인 실행을 큐 머리에서 기다리면 다른 준비된 요청이 있어도 슬롯이 빕니다.  
   **수정 방향:** `active < capacity`이고 실행 가능한 요청이 있는 동안 반복해서 채우고, 한 실행만 남았으면 그 실행이 모든 빈 슬롯을 사용할 수 있어야 합니다. 백오프 요청은 준비 큐에서 분리하십시오. acquire와 취소가 겹칠 때 HTTP 발행 전 신호를 다시 확인하고 슬롯은 정확히 한 번 반환해야 합니다.  
   **심각도: 높음 / 병렬성 영향: 있음**

4. **`request.on("close") → abort`는 정상 요청을 취소하거나 실제 이탈을 놓칠 수 있습니다.**  
   **근거:** [A/admin/index.ts:37](F:/dev/dualcontext/apps/dualcontext/src/server/admin/index.ts:37), `:42–49`; 현재 SSE의 유사 패턴은 `A/admin/runs/index.ts:86`.  
   **위험·상황:** 이번 Node **v26.4.0** 로컬 재현에서 정상 POST의 순서는 `request-end → request-close(complete=true, responseEnded=false) → response-close`였습니다. 본문 완료를 연결 이탈로 해석하면 정상 추론을 끊습니다. 반대로 본문 처리가 끝난 뒤 핸들러를 달면 해당 이벤트를 이미 놓쳤을 수 있습니다.  
   **수정 방향:** 응답의 비정상 종료와 정상 `writableEnded`를 구분하고, 요청 본문 중단도 별도로 처리해야 합니다. 실행 시작 전 취소, runId 발급 중 취소, 완료 직전 취소를 모두 다뤄야 합니다. 관찰용 SSE 종료나 관리자 API의 정상 202 응답을 실행 소유권 종료로 취급해서도 안 됩니다. [Node IncomingMessage 문서](https://nodejs.org/api/http.html#event-close_3)  
   **심각도: 높음 / 병렬성 영향: 있음**

5. **MCP progress는 장시간 실행 호환성의 충분조건이 아닙니다.**  
   **근거:** `SDK/shared/protocol.js:191–204`, `:452–475`, `:671–679`, `:740–742`; `D/plan/index.ts:57–80`.  
   **위험·상황:** 클라이언트가 `onprogress`와 `resetTimeoutOnProgress`를 사용하지 않으면 연장되지 않습니다. 사용해도 `maxTotalTimeout`은 남습니다. 단계 시작/종료 알림만으로는 한 모델 호출이 60초 넘게 조용한 경우를 커버하지 못합니다.  
   **수정 방향:** 실제 지원 클라이언트별 대기 계약이 필요합니다. 받은 `progressToken`으로 `extra.sendNotification`을 사용하고, 대기·실행 상태도 전달해야 합니다. 같은 progress 숫자를 반복하는 heartbeat는 규격과 맞지 않습니다. 서버가 모든 클라이언트의 제한을 연장할 수 있다는 전제는 제거하십시오. 제한을 설정할 수 없는 클라이언트까지 지원하려면 비동기 작업 조회 등의 **별도 계약 변경**이 필요합니다. [MCP progress 규격](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress)  
   **심각도: 높음 / 병렬성 영향: 있음**

6. **현재 stdio 종료 연결 방식은 SDK의 취소 전달까지 깨뜨릴 수 있습니다.**  
   **근거:** [A/index.ts:25](F:/dev/dualcontext/apps/dualcontext/src/server/index.ts:25), `:27`; `SDK/shared/protocol.js:224–227`, `:252–265`; `SDK/server/stdio.js:32–39`.  
   **위험·상황:** `connect()`가 설치한 `transport.onclose`를 앱이 나중에 덮어씁니다. SDK의 진행 중 요청 abort 처리를 우회할 수 있습니다. 설치된 stdio transport의 `start()`는 stdin의 `data/error`만 연결하므로 EOF 처리도 별도로 확인해야 합니다.  
   **수정 방향:** SDK 소유 transport 콜백을 보존하고, stdin EOF·프로세스 종료·요청 취소 알림을 중계 fetch의 수명과 연결하십시오. 추가로 이 SDK의 `_oncancel`은 falsy requestId를 건너뛰므로 **요청 ID 0 취소**도 회귀 항목에 포함해야 합니다(`SDK/shared/protocol.js:173–179`).  
   **심각도: 높음 / 병렬성 영향: 있음**

7. **HTTP 중계 자체에 작은 동시 연결 상한은 없지만, 기본 타임아웃과 노출 경계가 빠져 있습니다.**  
   **근거:** `node_modules/undici/lib/dispatcher/agent.js:18–21`, `pool.js:198–200`, `client.js:307–319`; `A/index.ts:35`, `docker-compose.yml:19–21`.  
   **위험·상황:** 설치된 undici 기본 Agent로 로컬 요청 **12개 동시 처리**를 확인했습니다. 따라서 중계가 본질적으로 직렬 병목이라는 근거는 없습니다. 그러나 기본 headers/body timeout은 300초이므로 장시간 응답이 잘릴 수 있습니다. 같은 Express listener에 내부 경로를 붙이면 클라이언트가 127.0.0.1로 접속한다는 이유만으로 경로가 비공개가 되지는 않습니다.  
   **수정 방향:** 중계 전용 dispatcher·스트림 타임아웃·backpressure를 명시하고, 내부 listener를 실제 loopback 전용으로 분리하거나 Unix socket 등으로 경계를 만드십시오. 서버 미기동 시 명확한 오류를 내고, 직접 엔진 실행으로 몰래 폴백해서는 안 됩니다. 재연결 때 이미 접수한 실행을 다시 시작하지 않는 식별 계약도 필요합니다. Node의 keep-alive 제한은 응답 중 추론 시한과 다른 개념입니다. [Node HTTP 문서](https://nodejs.org/api/http.html#serverkeepalivetimeout)  
   **심각도: 높음 / 병렬성 영향: 있음**

8. **신호를 타입에 추가하는 것만으로는 취소가 관통하지 않습니다.**  
   **근거:** [A/plan/calls/index.ts:24](F:/dev/dualcontext/apps/dualcontext/src/server/plan/calls/index.ts:24), `:31`; `A/routing/pipeline/index.ts:38–43`; `A/writer/index.ts:67–72`; `D/augment/index.ts:62–66`; `D/plan/build/index.ts:45–49`; `D/plan/dedupe/index.ts:63–64`.  
   **위험·상황:** `recordModel.chat(prompt)`가 새 options를 누락할 수 있습니다. 취소 오류가 조사원 실패·키워드 폴백·기본 writer 조립·dedupe 폴백으로 바뀌면 취소 후에도 후속 작업이 생깁니다. `Promise.all`의 한 분기를 reject시켜도 다른 분기가 자동 중단되지는 않습니다.  
   **수정 방향:** 실행에 묶인 model façade 또는 모든 래퍼의 options 전달 계약을 정하십시오. 모든 fallback 경계에서 실행 취소·시한은 일반 실패와 구분해야 합니다. 첫 실패 통지만으로 finalize하지 말고 이미 시작된 분기의 종료까지 관리해야 합니다. 웹 검색 rewrite, 최종 answer, 실행 질의 임베딩도 범위에 포함해야 합니다.  
   **심각도: 높음 / 병렬성 영향: 있음**

9. **시한 partial 반환과 사용자 취소가 같은 종료 경로로 설계돼 있습니다.**  
   **근거:** `A/admin/runs/lifecycle/index.ts:114–147`, `A/mcp/tools/augment/envelope/index.ts:17–20`, `packages/dualcontext_domain/src/common/model/plan/index.ts:94–102`, `SDK/shared/protocol.js:397–399`.  
   **위험·상황:** 플래너가 throw하면 `result/plan`은 아직 대입되지 않았을 수 있습니다. middle은 현재 비어 있지 않으면 `coverage=ok`입니다. MCP 요청 자체가 취소되면 SDK는 도구가 반환한 결과도 전송하지 않습니다. 따라서 “abort 후 partial 반환”은 항상 성립하지 않습니다.  
   **수정 방향:** 내부 deadline과 transport/user cancellation을 분리하십시오. deadline에는 안정된 조립 결과와 명시적인 종료 사유를 반환하고, 사용자 이탈에는 결과 저장·정리만 수행해야 합니다. 종료 사유를 공통 타입·MCP envelope·DB·프론트까지 맞춰야 합니다.  
   **심각도: 높음 / 병렬성 영향: 있음**

10. **light 5분 기본 시한은 정상 작업을 자를 수 있습니다.**  
    **근거:** `A/model/index.ts:11`, `A/model/chat/index.ts:37–52`, `A/mcp/tools/augment/effort/index.ts:15–22`.  
    **위험·상황:** 현재 허용하는 단일 채팅 유휴 시간만 10분이고 총 시간은 1시간입니다. 큐에서 기다리다 정상 추론 중인 light도 5분에 잘릴 수 있습니다. effort는 현재 처리 방식·라운드를 정하며 시간 SLA가 아닙니다.  
    **수정 방향:** 이번 자료만으로 middle/high/xhigh의 안전한 기본 시간을 산출할 수 없습니다. 우선 명시적 실행 예산을 지원하고, 정상 부하의 큐 대기와 완료시간 분포를 측정해 기본값을 정하는 편이 맞습니다. 5분을 채택한다면 “정상 작업 무영향”이 아니라 명시적 제품 제한으로 취급해야 합니다.  
    **심각도: 높음 / 병렬성 영향: 있음**

11. **DB 취소와 종료 기록은 별도의 생명주기가 필요합니다.**  
    **근거:** `A/db/index.ts:12`, `A/admin/runs/lifecycle/index.ts:142–147`, `A/admin/runs/nodes/index.ts:54–55`; `node_modules/pg/lib/client.js:574–594`, `:702–730`.  
    **위험·상황:** `{...deps, signal}`은 pg 쿼리를 취소하지 않습니다. 느린 쿼리가 pool 4개를 점유하면 model의 `settings()`까지 기다려 추론 발행이 멈춥니다. 반대로 저장 쿼리에도 이미 abort된 신호를 그대로 적용하면 terminal 상태를 기록하지 못합니다. 먼저 finalize하면 늦은 분기의 node/trace 저장과 경쟁합니다.  
    **수정 방향:** 대기 연결 획득, 실행 중 SQL 취소/서버 시한, rollback, 연결 회수의 계약을 정하십시오. 일반 `query_timeout`을 서버 계산 중단과 동일하게 취급하지 마십시오. 생산자 종료 → 저장기 close/flush → terminal 상태 확정 → terminal publish 순서와, 정리 전용 유한 예산이 필요합니다. 연결 재사용 뒤 늦은 cancel이 다음 쿼리를 건드리는 경우도 검증해야 합니다. [pg 설정 문서](https://node-postgres.com/apis/client)  
    **심각도: 높음 / 병렬성 영향: 있음**

12. **공유 작업을 실행 하나의 취소 신호에 종속시키면 다른 실행까지 피해를 봅니다.**  
    **근거:** `A/collect/codebase/acquire/index.ts:15–17`, `A/collect/crawler/index.ts:18–20`, `:58–61`, `A/collect/crawler/store/index.ts:99–109`.  
    **위험·상황:** A와 B가 같은 색인/크롤을 기다릴 때 A 취소로 공유 작업을 종료하면 B의 수집과 후속 추론이 지연됩니다. 새 `embedPending` 단일 비행에서도 같습니다.  
    **수정 방향:** 요청의 기다림 취소와 공유 작업 취소를 분리하고, waiter 수와 서비스 종료 소유권을 관리해야 합니다. 단일 비행 키에는 조사원뿐 아니라 내용 세대·모델 식별도 고려해야 합니다. 현재 임베딩 UPDATE는 URL·idx만으로 쓰므로 크롤 교체 중 옛 청크의 벡터가 새 청크에 붙는 경쟁도 방지해야 합니다.  
    **심각도: 높음 / 병렬성 영향: 있음**

13. **워커 엔트리는 현재 빌드·컨테이너 산출물에 자동 포함되지 않습니다.**  
    **근거:** [apps/dualcontext/package.json:12](F:/dev/dualcontext/apps/dualcontext/package.json:12), `:14`; `apps/dualcontext/tsconfig.server.json:4–8`; `apps/dualcontext/docker/Dockerfile:27–40`.  
    **위험·상황:** 서버 빌드는 `index.ts` 하나를 `dist/server/index.js` 하나로 번들링합니다. 소스 옆 `worker.ts`를 만들고 URL로 참조해도 별도 worker JS가 자동 출력되지 않습니다. 컨테이너에는 npm·node_modules도 없습니다.  
    **수정 방향:** 독립 worker 엔트리와 의존성을 번들 산출물로 만들고, 출력 위치 기준 ESM URL을 사용해야 합니다. 서버 엔트리를 그대로 워커로 실행해 HTTP/DB 초기화를 재실행해서도 안 됩니다. 검증은 소스 tsx가 아니라 **컨테이너에 복사할 dist만 있는 조건**에서 해야 합니다.  
    **심각도: 높음 / 병렬성 영향: 있음**

14. **색인 캐시 워커와 강제 종료 워커의 수명 요구가 충돌합니다.**  
    **근거:** `A/collect/codebase/rank/index.ts:15–47`, `A/collect/codebase/store/index.ts:35–40`, `A/collect/codebase/build.ts:50–60`, `A/collect/codebase/clone/index.ts:75–95`.  
    **위험·상황:** 요청 취소마다 캐시 워커를 죽이면 파싱·BM25 재구축이 반복됩니다. 한 워커에서 여러 작업을 진행하면 무관한 작업도 같이 사라집니다. git·파일 쓰기를 포함한 워커 종료에 `finally` 정리를 기대할 수 없고, 자식 git 종료도 보장되지 않습니다. 워커는 같은 PID를 쓰므로 현 임시 파일명도 작업 격리가 없으면 충돌합니다.  
    **수정 방향:** 캐시 검색은 협력적 취소와 프로젝트별 배치를 우선하고, 위험 정규식 같은 강제 종료 작업의 소유권을 분리하십시오. 강제 종료는 해당 작업만 실행 중인 워커에 적용하고, 종료 완료·교체·늦은 결과 폐기까지 관리해야 합니다. git과 임시 경로는 부모가 추적할 수 있어야 합니다. [Node worker 종료 문서](https://nodejs.org/api/worker_threads.html#workerterminate)  
    **심각도: 높음 / 병렬성 영향: 있음**

15. **크롤러 코사인만 워커로 옮기면 큰 CPU·복제 비용이 메인에 남습니다.**  
    **근거:** `A/collect/crawler/store/index.ts:148–153`, `node_modules/pg/lib/result.js:63–70`, `node_modules/pg-types/lib/textParsers.js:58–67`, `:188`.  
    **위험·상황:** 메인에서 `double precision[]`를 수천 행 디코딩한 뒤 워커에 보내면 디코딩과 구조화 복제가 메인을 계속 점유합니다. `pg.Pool`, 모델 객체, 주입 함수는 그대로 워커로 복제할 수 없습니다.  
    **수정 방향:** DB에서 순위를 계산해 topK만 받는 방안과, 워커에서 읽기·디코딩·순위까지 소유하는 방안을 비교하십시오. 후자는 DB 연결 총량·취소를 함께 설계해야 합니다. 메인에서 전달한다면 전송 가능한 버퍼를 고려하되, 버퍼 생성 비용까지 계측해야 합니다. 코드베이스는 제안대로 읽기부터 결과 포맷까지 워커에 남기는 편이 맞습니다.  
    **심각도: 높음 / 병렬성 영향: 있음**

16. **CPU 풀·캐시·색인 동시 1을 묶어서 “질의에 영향 없음”이라고 할 수 없습니다.**  
    **근거:** `A/collect/codebase/acquire/index.ts:46–55`, `A/collect/codebase/projects/index.ts:55–57`, `A/collect/codebase/config/index.ts:31–33`, `apps/dualcontext/docker/entrypoint.sh:18–36`.  
    **위험·상황:** cold index 질의는 build를 기다립니다. 갱신과 cold build를 같은 전역 1개 큐에 넣으면 앞선 다른 프로젝트 때문에 후속 추론이 늦어집니다. 모든 CPU 워커가 긴 인덱싱을 수행해도 검색이 밀립니다. 같은 컨테이너의 PostgreSQL도 CPU·메모리를 사용합니다.  
    **수정 방향:** 갱신과 질의 필수 작업의 서비스 정책을 구분하고 검색의 대기시간을 보장해야 합니다. 워커 수는 호스트 CPU 개수만으로 정하지 말고 실제 컨테이너 자원과 PG 부하를 반영하십시오. 캐시는 프로젝트 개수보다 **바이트 예산과 퇴출 정책**이 필요합니다.  
    **심각도: 높음 / 병렬성 영향: 있음**

17. **직렬화 합치기는 필요하지만, 현재 스냅샷 계약과 terminal 전달을 보존해야 합니다.**  
    **근거:** `D/plan/ports.ts:49–53`, `A/admin/runs/lifecycle/index.ts:67–99`, `A/admin/runs/nodes/index.ts:20–34`, `A/admin/runs/index.ts:57–66`.  
    **위험·상황:** 현재 trace는 계속 변하는 객체입니다. 참조만 보관해 나중에 직렬화하면 push 시점 스냅샷과 의미가 달라집니다. 얕은 node 복사도 중첩 객체 변경에 취약합니다. 계속 들어오는 이벤트에 trailing debounce만 쓰면 방송이 계속 밀립니다. DB 폴링을 없앤 뒤 마지막 publish가 실패하면 구독자가 종료를 영원히 놓칠 수 있습니다.  
    **수정 방향:** ‘최신 상태 표본’으로 계약을 바꾸거나 불변 patch/소유권 이전을 정하십시오. 구독자별 stringify를 줄이고, backpressure를 처리하며, 최대 방송 지연과 terminal 즉시 flush를 보장해야 합니다. 재접속 snapshot·단조 revision·최종 상태 재조회 경로도 유지해야 합니다. `onProgress`의 저장 대기가 추론 발행을 지연하는 현재 경로도 분리 대상입니다(`D/plan/index.ts:25–28`).  
    **심각도: 중간 / 병렬성 영향: 있음**

18. **선형화·응답 상한의 범위가 좁으면 CPU와 메모리 문제가 남습니다.**  
    **근거:** `A/plan/parse/index.ts:50–62`, `A/model/stream/index.ts:13–38`, `A/model/chat/index.ts:51–58`, `A/collect/duckduckgo/index.ts:20–24`, `A/collect/crawler/client/index.ts:84`.  
    **위험·상황:** content만 제한하면 개행 없는 SSE buffer, 큰 JSON fallback, 오류 본문, 크롤 응답은 남습니다. `[DONE]`을 받아도 현 루프는 EOF까지 읽습니다. JSON 스캐너만 단일 패스로 바꾸고 중첩 후보마다 `JSON.parse`하면 총 비용은 다시 커질 수 있습니다.  
    **수정 방향:** 수신 바이트·프레임·본문·파싱 깊이/후보 수를 함께 제한하고 정상 완료 신호 후 스트림을 정리하십시오. 파서 변경은 현재의 ‘기대 모양 후보 선택·문자열 속 괄호·부분 복구’ 의미를 보존해야 합니다. import 줄 단위화는 Go import 블록 등 현재 지원 형식을 유지해야 합니다(`symbols/languages.ts:58`).  
    **심각도: 높음 / 병렬성 영향: 있음**

19. **재시도 단일화는 맞지만, 로컬 abort와 원격 계산 종료를 동일시하면 안 됩니다.**  
    **근거:** `A/model/chat/index.ts:44–65`, `A/model/limit/index.ts:21–28`, `A/plan/ports/index.ts:45–55`.  
    **위험·상황:** 서버가 요청을 접수한 뒤 응답 연결만 끊어진 경우, 네트워크·유휴 오류 재시도가 같은 추론을 중복 실행할 수 있습니다. fetch abort가 GPU 작업 종료를 보장한다는 근거는 이 저장소에 없습니다.  
    **수정 방향:** 취소·전체 시한은 재시도 대상에서 제외하고 HTTP 발행 횟수를 한 계층에서 계상하십시오. 로컬 슬롯 반환과 upstream 작업 종료를 별도 지표로 검증해야 합니다. 파싱 실패에 대한 동일 호출 반복 제거는 타당하지만, analyze 실패·dedupe fallback·evaluate 실패는 서로 다른 정책이므로 모두 ‘아이템 실패’로 합치면 안 됩니다.  
    **심각도: 높음 / 병렬성 영향: 있음**

20. **높은 실행 수 상한보다 먼저 현재 로그 보관 규칙이 실행 중 행을 지웁니다.**  
    **근거:** [A/admin/runs/lifecycle/index.ts:174](F:/dev/dualcontext/apps/dualcontext/src/server/admin/runs/lifecycle/index.ts:174).  
    **위험·상황:** 오래 걸리는 실행 뒤에 신규 실행 500개가 생기면, 기존 실행이 아직 running이어도 행이 삭제됩니다. 엔진은 계속 실행되지만 상태·노드 저장·취소 조회가 깨질 수 있습니다. 실행 개수만 높은 값으로 제한해도 trace·프롬프트·큐 메모리는 보호되지 않습니다.  
    **수정 방향:** 보관 대상에서 실행 중 행을 제외하고, terminal 데이터 보관량과 활성 실행 메모리를 분리하십시오. 활성 실행은 실제 큐/컨텍스트/저장 대기 바이트를 기준으로 보호해야 합니다.  
    **심각도: 높음 / 병렬성 영향: 있음**

**더 단순한 대안과 유지할 부분**

- **단일 실행 소유자 자체는 타당합니다.** 전역 공정성, 취소 레지스트리, SSE를 함께 정리할 수 있습니다. 병목은 소유자가 하나라는 사실보다 그 안의 CPU 작업·직렬 대기·잘못된 용량 설정에서 생깁니다.
- **DB advisory lock 슬롯은 이번 요구의 더 단순한 대안이 아닙니다.** 세션 락은 획득한 DB 세션에 귀속됩니다. 지금의 pool 4개로 추론 중 락 세션을 붙잡으면 설정 조회·저장·헬스체크가 밀릴 수 있고, `pool.query`로 임의 연결에 lock/unlock을 보내는 방식도 안전하지 않습니다. 별도 연결·대기 통지·취소·공정성까지 필요해집니다. 근거: `A/db/index.ts:12`, `A/model/index.ts:27`, [PostgreSQL advisory lock 문서](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS).
- **기존 직렬 구간도 성능 개선 범위에서 빠졌습니다.** 조사원별 수집·프로시저 선택, `per_pair` writer, 하위 질의 라우팅은 순차 실행입니다. 각각 `D/augment/index.ts:56–78`, `:114`, `D/augment/select.ts:41`입니다. 의존성이 없는 작업을 준비 큐에 더 일찍 올리는 검토가 필요합니다. 게이트웨이만 작업 보존형이어도 아직 발행되지 않은 요청은 채울 수 없습니다.
- **답변 저장 2회→1회와 답변 생성 2회→1회는 구분해야 합니다.** 현재 before/after 생성은 이미 병렬입니다(`A/answer/index.ts:56–63`). 저장을 합칠 수는 있지만 한쪽 완료 결과의 즉시 보존이 사라집니다. 먼저 변경 필드별 FTS 재계산으로 불필요한 mecab 작업을 줄이는 편이 현재 동작을 더 잘 보존합니다.
- **SIGTERM은 abort 호출만으로 끝나지 않습니다.** 신규 접수 중지, 공유 작업 중단, 실행 종료와 기록의 유한 drain, HTTP/SSE 종료, pool/Agent/워커 종료가 한 종료 계약이어야 합니다. 현재 `server.close`는 SSE 때문에 대기할 수 있습니다(`A/index.ts:41–44`, `A/admin/runs/index.ts:68`). `closeAllConnections`는 강제 종료 시점에 사용할 수 있지만 작업 정리를 대신하지 않습니다.

**안전한 배포 경계는 기능 순서가 아니라 아래 의존 묶음입니다.**

| 묶음 | 함께 변경해야 하는 범위 | 활성화 조건 |
|---|---|---|
| 실행 종료 계약 | 실행 컨텍스트, model 래퍼, 모든 fallback, DB 취소, 저장기 close/flush, terminal 상태·partial envelope | 취소 후 추가 호출·늦은 저장·잘못된 성공 상태가 없어야 함 |
| 추론 게이트웨이 | 자원별 용량, 준비/백오프 큐, 공정성, 단일 재시도, 스트림 정리, 계측 | 기존 합산 부하에서 동시성·유효 처리량 비열화 |
| CPU 격리 | 선형화와 의미 회귀, worker 엔트리 빌드, 작업 소유권, 캐시·메모리 예산, 강제 종료 복구 | dist 실행 및 검색 지연 검증 |
| stdio 중계 | HTTP 내부 경계, 서버 readiness, MCP 취소·progress, 연결 수명, 중복 접수 방지 | 위 종료 계약·게이트웨이·CPU 지연 기준 충족 |
| 상태 전달 최적화 | trace/node 소유권, revision, terminal flush, 재접속 snapshot, 프론트 폴링 종료 | 모든 실행 writer가 단일 소유자로 전환된 뒤 DB 주기 폴링 제거 |

각 묶음은 개발을 병행할 수 있습니다. 다만 **stdio 통합을 먼저 활성화하고 CPU 격리나 합산 용량 보존을 나중에 붙이는 배포**, 또는 **취소 전달만 먼저 붙이고 종료 정합성을 나중에 고치는 배포**는 안전하지 않습니다.

**검증 계획에는 다음 보강이 필요합니다.**

| 대상 | 반드시 포함할 입력·합격 조건 |
|---|---|
| 병렬성 | HTTP+여러 stdio, 단일 실행의 다수 요청, chat/embed 별도 서버, 대기 실행 소멸. 준비 요청이 있고 용량이 남으면 다음 dispatch가 발생해야 함 |
| AIMD·재시도 | 일부 키만 429, 일시 503, 응답 유실, 유휴 지연. 다른 자원의 발행을 줄이지 않고 HTTP 시도 수·원격 잔존 작업을 구분 |
| 취소 경쟁 | 큐 등록 전후, 슬롯 획득 직후, 본문 수신 중, DB 실행 중, `Promise.all` 일부 완료, 최종 저장 중. 슬롯 이중 반환·terminal 이후 쓰기 금지 |
| MCP/HTTP | 정상 POST close, 응답 중 disconnect, 요청 취소 알림, stdin EOF, progress 미지원, 총 timeout, 요청 ID 0, 서버 재시작 |
| 공유·워커 | 두 실행 중 하나만 취소, 캐시가 있는 워커 반복 취소, ReDoS 작업 옆 정상 검색, git 실행 중 종료, worker exit 후 풀 복구 |
| 상태·메모리 | 느린 SSE 소비자, 마지막 publish 실패, 500개 넘는 신규 실행, 큰 프롬프트·SSE 무개행 입력, cold/warm index |
| 성능 판정 | in-flight 평균/최대뿐 아니라 **완료한 유효 작업/초, 성공률, 품질·coverage, 대기시간, p95/p99 지연, 이벤트 루프 지연, RSS·DB 대기** 비교 |

in-flight가 높아도 각 요청이 느려지면 처리량은 떨어집니다. 반대로 중복 재시도를 제거하면 총 HTTP 수가 줄어드는 것이 정상입니다. 따라서 “HTTP 요청 수가 줄지 않았다” 대신 **같은 유효 작업을 처리할 때의 발행 능력과 완료 처리량**으로 판정해야 합니다.

이번 검증은 소스 검토와 파일을 만들지 않는 격리 재현입니다. 계획 함수 재현에서 72회/108회, import 1740.7ms, robots 5초 초과, 정상 POST close 순서, undici 12개 동시 처리를 확인했습니다. 실제 추론 서버의 성능 개선·원격 취소·컨테이너 E2E는 검증하지 않았습니다. 규약 검사 4개는 Git Bash의 `CreateFileMapping … Win32 error 5`로 실행되지 않았으며 통과로 처리하지 않았습니다. 코드와 기존 미커밋 작업은 수정하지 않았습니다.

