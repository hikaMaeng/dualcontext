아래의 **해소는 설계상 해소**를 뜻합니다. 구현 완료를 뜻하지 않습니다. 이전 회차 보고서의 판정은 재사용하지 않았고, 이번에 현재 소스와 설치된 의존성을 직접 확인했습니다.

근거 경로의 약어는 다음과 같습니다.

- `V` = [apps/dualcontext/docs/execution-design.md](/F:/dev/dualcontext/apps/dualcontext/docs/execution-design.md)
- `S` = `apps/dualcontext/src/server`
- `D` = `packages/dualcontext_domain/src/server`
- `N` = `node_modules`
- 모든 상대 경로의 기준은 `F:\dev\dualcontext`입니다.

| 번호 | 1회차 지적 | 해소 여부 | 사실·구현 가능성 판정과 근거 |
|---|---|---|---|
| 1 | 전역 추론 병렬성 축소 | **부분** | 큐를 채팅·임베딩으로 나눈 방향은 **정확**. 그러나 6·16이 기존 병렬성을 보존한다는 주장은 **부정확**. 기존 채팅은 HTTP와 **각 stdio 프로세스마다** 3개이며 임베딩은 무제한이다. `V:28`, `S/index.ts:15–25`, `S/model/index.ts:11,24,61–65`. |
| 2 | AIMD로 정상 처리량 하락 | **해소** | 자동 감소를 없앤 설계가 명시되어 있다. **정확**. 다만 초기 소비자 수의 적정성은 1번과 별개다. `V:73`, `S/model/limit/index.ts:2–15`. |
| 3 | 백오프가 실행 자원을 점유 | **부분** | 지연 재투입 방향은 **정확**. 그러나 pull만으로 유휴 방지가 보장된다는 주장은 **부정확**. ready 작업 선택·재시도 깨우기·취소 경쟁이 미정이다. `V:10,29–32,72`, 현재 점유 위치 `S/model/index.ts:75`, `S/model/limit/index.ts:28`. |
| 4 | 정상 POST의 request close를 취소로 오인 | **해소** | 실행 소유 응답의 `close && !writableEnded`로 구분하는 방향은 **정확**. 본문 파서보다 앞에서 이탈을 감시해야 한다. 현재 SSE의 request close는 관찰 연결 정리 용도다. `V:83`, `S/admin/runs/index.ts:79–86`. |
| 5 | MCP progress를 충분조건으로 간주 | **부분** | 제한 사항을 인정한 것은 **정확**. SDK에서는 `onprogress` 등록도 필요하고, `maxTotalTimeout` 실패가 서버 취소로 이어지지 않는 경로가 있다. `V:85,158`, `N/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js:452–475,671–679`. |
| 6 | onclose 덮어쓰기·ID 0 취소 | **부분** | 체인으로 SDK 종료 처리를 보존하는 방향은 **정확**. ID 0은 시험만 추가해서 해결되지 않으며 EOF도 별도 처리해야 한다. `V:84`, `S/index.ts:27`, SDK `shared/protocol.js:173–179,252–265`, `server/stdio.js:32–38`. |
| 7 | 중계 타임아웃·외부 노출 | **해소** | 별도 loopback listener·전용 dispatcher·폴백 금지는 **구현 가능**. Docker 실접속 검증은 이번 환경에서 차단됐다. `V:81–83`, `docker-compose.yml:19–21`, `S/model/chat/index.ts:25`, `N/express/lib/application.js:598–599`. |
| 8 | signal 타입만 추가하고 실제 전달 누락 | **부분** | 바인딩 façade는 **구현 가능**하고 기존 Promise 반환형과 맞는다. 그러나 DB·파일·외부 수집·공유 작업까지 자동으로 취소되지는 않는다. `V:60–62`, `S/augment/base/index.ts:11,26`, `S/plan/calls/index.ts:19–37`, `D/plan/ports.ts:25–54`. |
| 9 | partial과 사용자 취소 혼동 | **부분** | 사유 분리는 **정확**. deadline 때 부분 결과를 꺼내는 반환 경로와 envelope 변경이 빠졌다. `V:64–67`, `D/plan/index.ts:36–55,78–95`, `S/mcp/tools/augment/envelope/index.ts:17–20`. |
| 10 | light 기본 5분 제한 | **해소** | 실행 시한 기본 없음은 요구에 부합한다. **정확**. 개별 채팅의 총 1시간·임베딩 15분 제한과 실행 시한은 구분해야 한다. `V:63`, `S/model/index.ts:11,43`. |
| 11 | DB 취소·종료 기록 생명주기 | **부분** | flush→종료→publish 순서는 **타당**. 하지만 현재 saver에는 close가 없고, 5초 초과 시 진행 중 SQL·늦은 쓰기를 처리할 계약이 없다. `V:66,86`, `S/admin/runs/lifecycle/index.ts:72–101,141–149`, `S/admin/runs/nodes/index.ts:48–56`. |
| 12 | 공유 작업이 한 요청 신호에 종속 | **부분** | detach와 텍스트 일치 UPDATE는 **정확한 개선**. 공유 작업 전용 모델·신호와 모델 설정 고정이 필요하다. `V:124`, `S/collect/crawler/index.ts:18–39`, `S/collect/crawler/store/index.ts:99–109`, `S/model/index.ts:62`. |
| 13 | 워커 엔트리 빌드 누락 | **해소** | 전용 엔트리와 dist 단독 검증 방향은 **구현 가능**. 출력 경로와 URL 기준을 명시하면 된다. 실제 빌드 검증은 `spawn EPERM`으로 미실행이다. `V:99`, `apps/dualcontext/package.json:12`, `N/esbuild/lib/main.js:685–741`. |
| 14 | 검색 캐시와 terminate 충돌 | **부분** | 검색 워커를 유지하는 방향은 **정확**. 결과 폐기는 계산 중단과 다르며, 캐시 갱신·전체 메모리 예산이 미정이다. `V:100–101`, `S/collect/codebase/rank/index.ts:18–49,57–87`. |
| 15 | 크롤러 코사인만 워커 이동 | **부분** | DB 이동과 배열→vector 캐스트는 **가능**. 그러나 제시한 거리 정렬만으로 기존 검색 의미가 보존된다는 근거는 부족하다. `V:103`, `004_crawler.sql:31`, `S/collect/crawler/store/index.ts:115–153`. |
| 16 | 전역 단일 CPU 큐로 질의 지연 | **부분** | 큐 분리는 **타당**. 소비자 배치가 정의되지 않아 “build가 검색에 밀리지 않는다”는 결론은 **근거불일치**다. `V:28,100–104`. |
| 17 | trace·patch 합치기 계약 | **부분** | 표본 trace·revision·종료 flush는 **타당**. calls만 불변으로 만들어 모든 patch가 안전해지는 것은 아니다. `V:108–117`, `S/plan/ports/index.ts:124–128`, `S/admin/runs/nodes/index.ts:49`. |
| 18 | 선형화 범위·의미 보존 | **부분** | 크기·깊이 상한 방향은 **타당**. robots의 제시 복잡도는 선형이 아니며, import·JSON의 의미 보존은 아직 **근거불일치**다. `V:90–95`, `S/collect/crawler/robots/index.ts:51–55`, `S/collect/codebase/symbols/languages.ts:29–59`, `S/plan/parse/index.ts:50–64`. |
| 19 | 재시도 단일화·원격 종료 구분 | **부분** | 단일 재시도와 로컬/원격 구분은 **정확**. 원격 잔존 작업 계측의 관측 수단이 없고, 재시도 기록 계약도 달라진다. `V:74–76`, `S/plan/calls/index.ts:31–37`, `S/plan/ports/index.test.ts:253–270`. |
| 20 | 보관 삭제가 running 행 삭제 | **해소** | running 제외는 **정확한 수정 방향**. 종료된 행만을 대상으로 최근 500개를 계산해야 한다. `V:122`, `S/admin/runs/lifecycle/index.ts:174`. |

**새 발견과 남은 설계 결함**

아래에서 P1은 최상위 수용 기준을 깨뜨리는 구현 전 필수 수정, P2는 정확성·운영 계약을 보완해야 하는 항목입니다.

1. **소비자 기본값의 비열화 근거가 틀렸습니다. — 부정확 / P1 / 병렬성 영향 있음**

   **근거:** `V:28`, [model/index.ts:11](/F:/dev/dualcontext/apps/dualcontext/src/server/model/index.ts:11), `S/index.ts:18–25`, `S/routing/index.ts:71–73`.

   HTTP 1개와 stdio 2개가 동시에 포화되면 기존 채팅 상한은 **9개**, v3는 **6개**입니다. 임베딩도 기존에 17개 이상의 독립 호출이 발생할 수 있으므로 16은 실제 감소입니다. 이름을 소비자로 바꾸어도 발행 가능한 동시 요청 수가 줄어드는 사실은 같습니다.

   **수정 방향:** 큐 모델은 유지하되 6·16을 “비열화가 확인된 값”으로 쓰지 마십시오. 기존 HTTP+복수 stdio의 합산 부하와 임베딩 16 초과 사례에서 필요한 소비자 수를 정하고, 배포 설정과 수용 시험에 고정해야 합니다. 큐 길이 제한이나 실행별 몫 제한을 추가할 필요는 없습니다.

2. **소비자 루프에 `await run(task)`가 빠져 있습니다. — 부정확 / P1 / 병렬성 영향 있음**

   **근거:** [execution-design.md:72](/F:/dev/dualcontext/apps/dualcontext/docs/execution-design.md:72), `S/model/chat/index.ts:33–58`.

   문서 그대로 `while (...) { task = await pull(); run(task) }`를 구현하면 소비자는 실행 완료를 기다리지 않고 다음 작업을 가져갑니다. 준비된 작업이 많으면 소비자 하나가 여러 추론 요청을 발행하므로 “소비자 수가 부하 상한”이라는 핵심 계약이 무너집니다.

   **수정 방향:** 소비자 하나가 **한 시도의 자원 정리까지 await**하도록 명시하십시오. 재시도 시에는 다음 시도만 지연 큐에 넣고 현재 소비자를 반환하며, 최초 `submit`의 Promise는 최종 결과까지 유지해야 합니다.

3. **pull·라운드로빈만으로 실행 가능 작업의 즉시 소비가 보장되지는 않습니다. — 부정확·근거불일치 / P1 / 병렬성 영향 있음**

   **근거:** `V:10,27,29–31,104,149`.

   실행 A의 선두가 `notBefore=미래`이고 그 뒤에 즉시 실행 가능한 작업이 있으면, 선두만 보는 하위 큐는 작업을 막습니다. 모든 소비자가 잠든 뒤 재시도 시각에 깨우지 않아도 유휴 상태가 됩니다. 질의 필수 작업이 계속 들어오는 엄격한 우선순위에서는 갱신 작업이 영구히 굶을 수 있습니다.

   반대로 **ready 작업만 가진 실행별 하위 큐를 라운드로빈**하면, A가 큰 웨이브를 먼저 넣었다는 이유만으로 B의 첫 작업이 A의 전체 웨이브 뒤로 밀리지는 않습니다. 이 부분은 적절한 방향입니다.

   **수정 방향:** ready 큐와 지연 작업을 분리하고, 실행별 순환 선택·재시도 시각 깨우기·취소 시 제거를 정의하십시오. 유휴 금지는 “**실행 가능한 작업이 있고 해당 소비자가 비어 있을 때**”로 고쳐야 합니다. 우선순위에는 갱신 작업의 최대 대기 또는 aging 규칙을 두십시오.

4. **큐에서 취소 작업을 제거한 뒤 Promise를 어떻게 끝내는지가 없습니다. — 근거불일치 / P1 / 병렬성 영향 있음**

   **근거:** `V:30–32,62,66`, `D/plan/build/index.ts:35–63`, `D/plan/dependencies/index.ts:34–48`.

   큐 항목만 삭제하고 Promise를 pending으로 남기면 `await submit()`과 분기 drain이 끝나지 않습니다. 반대로 취소 직후 재시도 타이머가 같은 작업을 다시 넣으면 취소된 추론이 재발행됩니다. fetch abort를 호출하자마자 소비자를 재사용하면서 기존 실행의 정리를 기다리지 않으면 로컬 실행도 겹칠 수 있습니다.

   **수정 방향:** 작업마다 단 하나의 최종 settle을 보장하고, 대기 취소는 `RunAborted`로 reject한다고 명시하십시오. pull·재투입·완료와 취소의 승자 규칙, 타이머 해제, 취소 후 재투입 금지가 필요합니다. 병렬 분기는 기존 `Promise.all`의 조기 reject에 의존하지 말고, 시작한 분기 전부의 정착을 확인해야 합니다.

5. **“큐 항목은 작은 서술자”라는 메모리 전제가 성립하지 않습니다. — 부정확 / P1 / 병렬성 영향 있음**

   **근거:** `V:26,30,117`, `S/model/index.ts:61,72`, `S/plan/ports/index.ts:82–100,144–155`, `S/plan/calls/index.ts:24–31`.

   채팅 입력은 완성된 프롬프트 문자열이고 임베딩 입력은 문자열 배열입니다. 객체에 참조만 들어가도 대기 중인 Promise·클로저가 원본을 붙잡습니다. **서로 다른 대형 프롬프트가 계속 쌓이는 경우**, 소비자 수가 일정해도 대기 메모리와 GC 부하는 증가합니다. 종료 스냅샷을 보관하는 허브에도 수명·제거 규칙이 없습니다.

   **수정 방향:** 무제한 접수는 유지하면서 payload의 저장 위치·공유 참조·소비 시 조립·필요 시 디스크 적재 방식을 정하십시오. 완료·취소 시 참조 제거, 종료 허브의 TTL/바이트 예산도 필요합니다. 소비자 수가 제한하는 것은 **실행 중 작업 수**이며 전체 RSS까지 제한하는 것은 아닙니다.

6. **SQL 코사인은 가능하지만 현재 제안에는 입력·차원 계약이 빠졌습니다. — 캐스트는 정확, 안전성은 근거불일치 / P1 / 병렬성 영향 있음**

   **근거:** `V:103`, [004_crawler.sql:31](/F:/dev/dualcontext/apps/dualcontext/docker/initdb/004_crawler.sql:31), `S/collect/crawler/store/index.ts:146–153`, `N/pg/lib/utils.js:73–75`.

   pgvector 0.8.6에는 `double precision[] → vector` 캐스트가 실제로 존재합니다. 따라서 **컬럼의 `embedding::vector` 자체는 가능**합니다. 다만 다음 문제가 남습니다.

   - JS 배열을 `$1::vector`에 그대로 바인딩하면 pg는 `{"1","2","3"}` 형태로 전달합니다. vector의 `[...]` 입력과 다릅니다. 이번 실행에서도 해당 변환을 확인했습니다.
   - 같은 `embedding_key` 안에 서로 다른 차원이 있으면 거리 계산은 오류입니다. 스키마에는 차원 제약이 없습니다.
   - 배열의 NULL 원소·비유한 값 등은 캐스트에서 실패할 수 있고, float8에서 vector로 바뀌며 정밀도도 달라집니다.

   **수정 방향:** 질의 파라미터는 명시적인 vector 문자열 또는 `$1::double precision[]::vector`로 정하십시오. 저장 시 차원·원소 검증과 기존 행 처리 정책이 필요합니다. 차원 조건과 거리를 같은 WHERE에 단순 AND로 배치해 평가 순서를 기대해서는 안 됩니다. 안전한 CASE 또는 검증된 입력 집합을 사용하고 실제 쿼리의 실행 계획을 확인해야 합니다. **ORDER BY가 항상 필터보다 먼저 실행된다고 단정하는 것도 부정확**합니다. [pgvector 0.8.6 캐스트 정의](https://github.com/pgvector/pgvector/blob/v0.8.6/sql/vector.sql#L153), [벡터 검사·거리 구현](https://github.com/pgvector/pgvector/blob/v0.8.6/src/vector.c#L65), [PostgreSQL 평가 순서 규칙](https://www.postgresql.org/docs/17/sql-expressions.html#SYNTAX-EXPRESS-EVAL).

7. **단순 거리 정렬 후 topK는 현재 검색 결과를 보존하지 않습니다. — 근거불일치 / P1 / 병렬성 영향 없음**

   **근거:** `V:103`, [crawler/store/index.ts:130](/F:/dev/dualcontext/apps/dualcontext/src/server/collect/crawler/store/index.ts:130), `S/collect/crawler/config/index.ts:30–34`.

   현재 순서는 **유사도 정렬 → minScore → 페이지별 perPage → 전체 topK**입니다. 상위 세 청크가 모두 같은 페이지이고 `perPage=2, topK=3`이면, SQL에서 먼저 3개만 가져와 후처리할 경우 다른 페이지의 네 번째 청크를 잃습니다. `<=>`는 거리이므로 기존 `score`에는 `1-distance` 변환도 필요합니다. 기존 JS 코사인의 영벡터·차원 불일치 동작 역시 DB 구현과 다릅니다.

   **수정 방향:** 페이지별 순위를 계산해 `perPage`를 적용한 뒤 전체 topK를 정하는 SQL을 명시하십시오. minScore 경계, 영벡터 정책, 동점 순서와 부동소수점 오차 허용치를 회귀 시험에 포함해야 합니다.

8. **MCP 취소 보장은 설치된 SDK의 실제 동작과 어긋납니다. — 부정확 / P1 / 병렬성 영향 있음**

   **근거:** `V:84–85,158`, SDK `shared/protocol.js:173–179,452–475,698–742`, `server/stdio.js:32–38,54–67`.

   이번에 설치된 **SDK 1.32.2의 실제 InMemoryTransport 연결**로 확인한 결과입니다.

   | 상황 | 관찰 결과 |
   |---|---|
   | 요청 ID 0에 취소 알림 | 서버 signal이 abort되지 않음 |
   | 요청 ID 1에 같은 취소 알림 | 서버 signal이 abort됨 |
   | progress 수신 중 `maxTotalTimeout` 초과 | 클라이언트 오류, 서버 signal은 abort되지 않음 |
   | StdioServerTransport 입력 EOF | `onclose`가 자동 호출되지 않음 |

   또한 `resetTimeoutOnProgress`만으로 충분하지 않습니다. SDK는 `onprogress`가 등록되어야 progress handler/token을 만들며, 알려지지 않은 token이면 타이머 갱신 전에 반환합니다.

   **수정 방향:** ID 0의 보완 위치를 명시하고, EOF에는 직접 transport 종료와 중계 abort를 연결해야 합니다. “클라이언트 시간 초과 시 서버도 취소된다”는 문구는 **취소 알림 또는 연결 종료가 관찰되는 경우**로 한정하십시오. 비동기 작업 계약을 이번 범위 밖으로 두는 결정 자체는 문제없습니다.

9. **5초 정리 예산으로 DB 종료 순서를 보장할 수 있는 설계가 없습니다. — 근거불일치 / P1 / 병렬성 영향 있음**

   **근거:** `V:66,86,123`, `S/admin/runs/lifecycle/index.ts:98–100,141–149,173`, `S/admin/runs/nodes/index.ts:54–56`, `N/pg/lib/client.js:574–594,702–730`.

   pg 8.23.1의 일반 query 경로에는 실행 signal을 전달하는 것만으로 취소되는 기능이 없습니다. `connectionTimeoutMillis`는 실행 중 SQL을 중단하지 않습니다. `query_timeout`도 서버 SQL 완료를 증명하지 않습니다.

   5초 뒤 `Promise.race`만 빠져나오면 이전 UPDATE가 살아 있을 수 있습니다. 반대로 무조건 settle을 기다리면 5초 종료를 보장하지 못합니다. 현재 `startRun`의 `void embedRunQuery(...)`도 saver drain 밖에서 실행 행을 수정합니다.

   **수정 방향:** 대여한 연결·실행 중 쿼리·서버 취소 또는 연결 폐기·종료 확인의 소유권을 정하십시오. saver의 close는 새 push를 막아야 하며, progress 큐와 실행 소유 부수 작업도 drain 대상에 포함해야 합니다. 정리 실패 때 DB 기록 실패를 성공처럼 publish하지 않는 정책도 필요합니다.

10. **모델 façade만으로 실행 전체의 취소가 관통되지는 않습니다. — 근거불일치 / P1 / 병렬성 영향 있음**

   **근거:** `V:60–62`, `S/augment/base/index.ts:18–29`, `S/collect/folder/index.ts:42–64`, `S/collect/duckduckgo/index.ts:15–17`, `D/augment/index.ts:61–66`.

   façade는 chat/embed에는 효과적입니다. 그러나 폴더 읽기·DB 질의·웹 수집·공유 작업 대기에는 실행 신호가 전달되지 않습니다. `RunAborted`를 다시 던지도록 수정해도 이 작업들이 끝나지 않으면 병렬 분기 drain이 지연됩니다.

   **수정 방향:** `Deps`와 수집 포트에 요청 생명주기 전달 경계를 추가하고, 실행 소유 작업의 abort와 공유 작업의 detach를 구분하십시오. 도메인에서 `RunAborted`를 판정해야 한다면 앱 모듈을 역으로 import하지 않도록 공통 계약의 위치도 정해야 합니다.

11. **deadline의 partial 반환 경로가 현재 호출 구조에 없습니다. — 근거불일치 / P1 / 병렬성 영향 없음**

   **근거:** `V:64`, `D/plan/index.ts:36–55,78–95`, `D/plan/assemble/index.ts:8–12`, `S/augment/index.ts:80–85`, `S/mcp/tools/augment/index.ts:55`, `S/mcp/tools/augment/envelope/index.ts:17–20`.

   플래너의 graph는 함수 내부에 있고, `runAugment`는 성공 반환 후에만 결과를 만듭니다. 중간에 `RunAborted`가 던져지면 lifecycle은 오류만 받습니다. 현재 middle의 비어 있지 않은 결과는 envelope에서 `coverage=ok`가 되므로 deadline partial을 표현할 수도 없습니다.

   **수정 방향:** 플래너 내부에서 deadline을 처리해 안정된 부분 graph를 조립하거나, 부분 결과·trace·종료 사유를 포함한 명시적 반환 계약을 정하십시오. 사용자 취소와 deadline 반환은 분리하고, 형제 분기가 정리된 뒤 부분 결과를 확정해야 합니다.

12. **공유 임베딩은 텍스트 일치 조건만으로 충분하지 않습니다. — 근거불일치 / P1 / 병렬성 영향 있음**

   **근거:** `V:61,124`, `S/collect/crawler/store/index.ts:99–109`, `S/model/index.ts:26–34,61–64`, `S/routing/index.ts:25–35`.

   `embedPending`이 키 A를 읽은 뒤 설정이 B로 바뀌면, `model.embed`는 설정을 다시 읽어 B 벡터를 만들 수 있습니다. UPDATE의 텍스트가 같아도 **B 벡터를 A 키로 저장**합니다. 요청 바인딩 façade를 공유 크롤에 그대로 전달하면 첫 요청 취소가 공유 임베딩을 끊는 문제도 남습니다.

   **수정 방향:** 공유 작업에는 자체 신호와 모델 실행 설정을 고정한 클라이언트를 사용하십시오. 단일 비행·캐시 키는 실제 벡터 공간을 식별해야 하며, 모델 이름만 같은 다른 endpoint/설정도 구별해야 합니다. 텍스트 일치 검사는 유지하십시오.

13. **CPU 소비자·캐시의 소유권과 협력 취소 정의가 부족합니다. — 근거불일치 / P1 / 병렬성 영향 있음**

   **근거:** `V:28,41,100–104`, `S/collect/codebase/acquire/index.ts:44–58`, `S/collect/codebase/rank/index.ts:18–49,57–87`, `S/collect/codebase/store/index.ts:30–38`.

   `cpu.search` 결과를 버리는 것만으로는 CPU 계산이 중단되지 않습니다. 동기 검색 루프는 worker 메시지도 처리하지 못할 수 있습니다. CPU 2개가 세 큐에 전용인지 공유인지에 따라 build 기아와 총 스레드 수가 달라집니다.

   장수 워커가 인덱스를 캐시하면 현재처럼 파일을 다시 읽지 않으므로, 원자적 파일 교체 후 **캐시 무효화 계약**도 필요합니다. 512MB가 파일 크기인지 파싱 객체와 postings까지 포함하는지, 워커별인지 전체인지도 불명확합니다.

   **수정 방향:** 큐별 소비자 배치, 검색 중 취소 확인 방법, 실제 계산 종료 시점, 인덱스 generation 통지와 메모리 산정 범위를 명시하십시오. `hasIndex`와 다중 프로젝트 경로까지 워커로 옮겨야 메인의 전체 JSON 파싱이 제거됩니다.

14. **비동기 소비자에 남는 동기 후처리가 이벤트 루프 목표에서 빠졌습니다. — 근거불일치 / P1 / 병렬성 영향 있음**

   **근거:** `V:33,75,108,115`, `S/model/index.ts:41–47`, `S/model/chat/index.ts:51–55`, `S/model/stream/index.ts:23,33–38`, `S/collect/crawler/client/index.ts:83–84`, `N/undici/lib/web/infra/index.js:177–178`.

   `await response.json()` 뒤 JSON 파싱은 비동기 계산이 아닙니다. undici는 `JSON.parse`를 실행합니다. 큰 임베딩 응답·크롤러 응답·비스트리밍 채팅 응답은 메인을 점유합니다. trace를 1초에 한 번 직렬화해도 **한 번의 큰 직렬화 지연**은 남습니다.

   스트림 가드도 chat SSE 외에 비스트리밍 JSON, 오류 본문, 내부 NDJSON을 포함해야 합니다. 현재 `.text().slice(...)`는 전체 본문을 받은 뒤 자릅니다.

   **수정 방향:** 수신 중 바이트 제한, 파싱 단위의 크기 제한, 큰 후처리의 워커 이동 또는 분할 실행을 명시하십시오. SSE는 UTF-8 청크 경계·CRLF·여러 data 줄·마지막 줄·`[DONE]` 정리·상한 초과 오류를 시험하고, 가드 오류를 일시적 네트워크 오류로 재시도하지 않아야 합니다.

15. **선형화와 의미 보존을 동시에 만족한다는 근거가 없습니다. — 부정확·근거불일치 / P1 / 병렬성 영향 있음**

   **근거:** `V:90–95`, `S/collect/crawler/robots/index.ts:51–64`, `S/collect/codebase/symbols/languages.ts:29–59`, `S/plan/parse/index.ts:50–64,93–111`.

   - **robots:** 문서의 `O(경로×패턴)`은 두 입력에 대한 선형 시간이 아닙니다. 마지막 별표로 되돌아가는 방식은 `*aaa…ab`와 긴 `aaa…a`에서 긴 부분을 반복 비교할 수 있습니다. 현재 매칭은 접두 일치, 끝 `$`, 최장 규칙·동률 Allow 우선도 보존해야 합니다.
   - **import:** 실제 현재 함수를 실행했을 때 여러 줄 `require(\n "./dep"\n)`와 Go import 블록은 인식됐지만 단순 줄별 실행은 놓쳤습니다. 400자 초과 줄에 있는 유효 import도 기존에는 인식됩니다.
   - **extractJson:** 현재 함수는 `{"wrapper":{"items":[]}}`의 내부 후보와 `{broken {"items":[]}`의 복구 후보를 선택합니다. 심지어 기본 후보 순회는 외부 JSON 문자열 안의 `[1,2]`도 별도 후보로 선택할 수 있습니다. “문자열 속 괄호 보존”의 의미를 단순한 전역 문자열 상태로 대체하면 현재 동작이 달라집니다.

   **수정 방향:** robots는 실제 복잡도를 정직하게 기재하고 총 작업량 상한까지 정의하십시오. import는 줄을 읽되 여러 줄 상태를 유지하는 스캐너가 필요합니다. JSON은 지원할 후보 선택·중첩 복구·깨진 opener 복구 범위를 명시하고, 제한 밖 입력의 동작 변경을 별도로 선언해야 합니다.

16. **표본 trace·얕은 patch·허브의 종료 정합성이 하나의 계약으로 닫히지 않았습니다. — 근거불일치 / P2 / 병렬성 영향 있음**

   **근거:** `V:108–118,133`, `S/admin/runs/nodes/index.ts:49`, `S/plan/ports/index.ts:124–128`, `S/admin/runs/lifecycle/index.ts:30–32`, `S/front`가 아닌 실제 프론트 파일 `apps/dualcontext/src/front/features/runs/view/workbench/use-node-detail/index.ts:21–45`.

   node patch에는 calls 외에 `provided`, `augment.routing`, `augment.pairs`가 있습니다. calls만 불변이라는 사실은 전체 얕은 병합의 충분조건이 아닙니다. 허브도 종료 publish의 DB 읽기가 실패했을 때 보관할 확정 스냅샷의 출처가 정해져 있지 않습니다.

   또한 실행 trace에서 노드가 built로 보여도 node saver의 최종 문서가 아직 DB에 없을 수 있습니다. 그 시점에 노드 상태만 보고 폴링을 멈추면 최종 상세를 놓칩니다.

   **수정 방향:** patch 전체의 소유권 또는 불변성을 정의하고, 허브 revision·node 저장 완료 revision·종료 스냅샷의 관계를 정하십시오. 먼저 단일 소유자의 기존 bus에 갱신 합치기와 확정 종료 스냅샷을 추가하는 방식으로 단순화할 수 있습니다.

17. **생산자 병렬화가 모든 자원의 부하를 소비자 수로 제한하지는 않습니다. — 부정확 / P1 / 병렬성 영향 있음**

   **근거:** `V:125,129`, `D/augment/index.ts:56–78,114`, `S/collect/folder/index.ts:47–64`, `S/collect/crawler/index.ts:13–39`, `S/collect/crawler/walk/index.ts:61–99`.

   조사원들을 병렬 호출하면 모델 큐에 도달하기 전에 파일 읽기·DB·웹 수집이 시작됩니다. 현재 제시된 다섯 큐가 이 자원을 모두 소유하지 않습니다. 폴더의 20MB 제한도 조사원별로 적용하면 실행 전체 합산 상한이 되지 않습니다.

   반대로 크롤러 요청 전역 1은 현재 서로 다른 조사원의 동시 크롤을 직렬화합니다. 두 cold crawler가 필요한 질의에서 수집 지연과 뒤따르는 추론 발행 지연이 증가할 수 있습니다.

   **수정 방향:** 모델 호출 생산자와 실제 수집 작업의 실행 자원을 구분하십시오. 외부 수집·파일·DB 경로의 소비 방식과 바이트 예산 소유자를 정의하고, 크롤러 1 역시 비열화가 입증되지 않은 기본값으로 표시해야 합니다.

18. **재시도 단일화 후 호출 기록과 원격 잔존 지표의 의미가 달라집니다. — 근거불일치 / P2 / 병렬성 영향 있음**

   **근거:** `V:74–76`, `S/plan/calls/index.ts:24–37`, `S/plan/ports/index.test.ts:253–270`.

   재시도를 façade 아래로 옮기면 `recordModel`에는 전체 재시도가 **논리 호출 한 건**으로 보입니다. 현재 테스트는 계획 재시도의 매 시도를 별도 calls로 기대합니다. “temperature 0이므로 재시도는 의미 없다”는 것도 현재 코드만으로 보장할 수 없습니다.

   또한 현재 모델 프로토콜에는 원격 작업 ID·조회·종료 확인 경로가 없습니다. 로컬 abort 이후 upstream에서 실제로 얼마나 남아 도는지 확정 계측할 근거가 없습니다.

   **수정 방향:** 논리 호출과 시도별 기록을 구분하고 해당 테스트를 변경하십시오. 파싱 재시도 제거는 비용·정확도 정책으로 설명해야 합니다. 원격 종료는 확인 기능이 없으면 `unknown`으로 남기고 로컬 취소 건수와 구별하십시오.

**구현 가능성과 나머지 사실 주장에 대한 확인**

- **현재 동작을 설명한 `V:47–53`은 대체로 정확합니다.** 인스턴스별 limiter, 임베딩 무제한, limiter 안의 백오프, 두 재시도 층으로 최대 16회, 실행 signal 부재, onclose 덮어쓰기, running 제외 없는 보관 삭제, 단일 서버 번들, 열거한 동기 CPU 경로를 소스에서 확인했습니다. “컨테이너에 node_modules가 없다”는 것은 `Dockerfile:27–40`의 **이미지 구성상 확인**이며 실행 중 컨테이너 내부 확인은 아닙니다.

- **모델 façade의 Promise 통합은 가능합니다.** `chat(): Promise<string>`, `embed(): Promise<number[][]>`를 유지하면 `recordModel`, `Deps.model`, `PlanPorts`를 큐 타입으로 전면 변경할 필요는 없습니다. 현재 `createModelClient` 호출 지점은 제품의 `S/index.ts:18`과 시험 스크립트 `test/20261113/slow-header-probe.mjs:24`입니다. 함수 정의는 `S/model/index.ts:23`입니다. 실행별 façade 외에도 관리자 검색·라우팅 미리보기·백필 같은 실행 외 호출이 같은 전역 큐를 이용하는 경계를 정해야 합니다.

- **테스트 영향은 명확합니다.** `plan/calls/index.test.ts:16–49`의 위임·기록·병렬 분리는 유지 대상으로, `plan/ports/index.test.ts:253–270`의 시도별 기록·파싱 재시도 기대는 변경 대상입니다. `D/plan/index.test.ts:408`의 단계별 onTrace 계약과 앱의 표본 저장 계약도 구분해야 합니다. lifecycle/node saver 시험에는 close 후 push, 진행 중 SQL, 늦은 분기, 최종 기록 실패를 추가해야 합니다.

- **esbuild 0.28.0의 다중 엔트리 출력은 가능합니다.** `--outfile`을 `--outdir`로 바꾸면서 명시적 엔트리 이름 또는 `outbase`를 정해야 합니다. 폴더 경계를 지키려면 소스는 `workers/search/index.ts`처럼 두고 원하는 출력명에 매핑할 수 있습니다. 서버 번들의 `import.meta.url`은 출력된 서버 파일 기준이므로 worker URL도 그 기준이어야 합니다. `createRequire` 배너는 각 번들에 필요할 수 있지만 외부 패키지를 자동으로 제공하지는 않습니다. 현재 front 경로 계산도 서버 출력 위치에 의존합니다. `N/esbuild/lib/main.js:685–741`, `S/app.ts:14–15`, `apps/dualcontext/docker/Dockerfile:40`. [esbuild 출력 경로 규칙](https://esbuild.github.io/api/#outbase).

- **내부 listener는 구현 가능합니다.** Express는 `app.listen`마다 HTTP 서버를 생성할 수 있습니다. 같은 컨테이너에서 실행하는 stdio 프로세스는 내부 loopback listener를 이용할 수 있으며 host port 게시가 필요하지 않습니다. 다만 **게시하지 않는 것만으로 loopback 바인딩이 되는 것은 아니므로** 반드시 주소를 명시해야 합니다. stdio 분기도 현재 `S/index.ts:16–21`의 DB 초기화보다 앞으로 옮겨야 합니다. 내부 포트는 `env.ts` 검증 대상에 추가하십시오. [Docker exec 동작](https://docs.docker.com/reference/cli/docker/container/exec/).

- **시한 기본 없음과 MCP 비동기 작업 계약 제외는 수용 가능한 결정입니다.** 측정하지 않은 실행 시한으로 정상 작업을 자르지 않는 방향에 동의합니다. 다만 위 MCP 취소 제한을 정확히 문서화해야 합니다.

- **프론트 최적화의 현황 근거는 정확합니다.** 실행 중 목록은 5초마다 다시 조회하며 의미 검색은 매번 모델을 호출합니다. 언어 번들은 현재 모두 정적 import입니다. `apps/dualcontext/src/front/features/runs/list/use-run-list.ts:6,38–43`, `S/admin/runs/list/index.ts:20–24`, `apps/dualcontext/src/front/i18n.ts:1–8`. 캐시에는 질의뿐 아니라 모델 설정 식별자·수명·동시 요청 단일 비행이 필요합니다.

- **구성 요소별 tsvector 열은 가능한 최적화지만 효과는 미측정입니다.** 현재 트리거는 모든 trace/progress UPDATE가 아니라 `query,pairs,context,answers` UPDATE에 실행됩니다. 따라서 이 변경을 trace 쓰기 병목의 해결책으로 설명하면 근거가 맞지 않습니다. `005_runs_search.sql:37–49`. 먼저 변경 없는 UPDATE의 재계산을 건너뛰는 안과 비교하고, 열을 추가한다면 기존 데이터 backfill과 동일 검색 결과 검증을 포함하십시오.

설치된 버전은 **MCP SDK 1.32.2, undici 8.12.4, pg 8.23.1, Express 5.2.1, esbuild 0.28.0**으로 확인했습니다. SDK 취소·EOF, import 추출, JSON 후보 선택, pg 배열 인코딩 반례는 메모리에서 실행했습니다.

실제 DB SQL·컨테이너 listener는 Docker API 권한 거부로, 메모리 전용 esbuild 검증은 `spawn EPERM`으로 실행하지 못했습니다. 저장소 검사 스크립트 네 개도 Git Bash의 `CreateFileMapping ... Win32 error 5`로 summary 없이 종료했으므로 **통과로 판정하지 않았습니다**. 파일은 수정하지 않았습니다.

**“구현을 시작해도 되는가” 판정: 현재 v3 그대로는 보류입니다.**

큐가 모든 요청을 받고 소비자가 당겨 가는 방향은 유지할 수 있습니다. 구현 전에 문서에서 반드시 고칠 항목은 다음입니다.

1. 6·16·크롤러 1의 비열화 단정 제거와 합산 부하 기준 확정.
2. `await run`, ready/지연 큐, 실행별 순환 선택, 우선순위 기아 방지 규칙.
3. 취소·재시도·완료의 단일 Promise settle과 분기 drain 계약.
4. 무제한 대기의 payload 보관·해제 방식과 캐시·허브 수명.
5. SQL 벡터 입력·차원·유효값·페이지별 순위 보존 계약.
6. MCP ID 0·EOF 보완 방식과 `maxTotalTimeout` 취소 제한.
7. 모델 외 취소 전달, 공유 작업 자체 신호와 모델 설정 고정.
8. DB 취소·연결 정리·5초 초과 정책·종료 이후 쓰기 방지.
9. deadline 부분 결과의 반환·저장·coverage 계약.
10. CPU 소비자 배치·실제 협력 취소·캐시 generation·전체 바이트 예산.
11. 메인에 남는 파싱·직렬화의 크기/시간 경계와 스트림 가드 범위.
12. robots/import/JSON의 실제 복잡도와 지원 의미, patch·node 저장 완료·허브 종료의 정합성.

