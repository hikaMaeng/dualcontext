# 실행 모델 설계: 큐와 소비자 (v5)

> v5 = v4 + 3회차 리뷰(`test/20261119/codex-review-round3/`) 반영. 아래 「v5 개정」 절이 v4 본문의 해당 항목을 **대체한다**.

엔진 전수검사와 Codex 설계 리뷰 1 · 2회차(`test/20261119/codex-review-strategy/`, `test/20261119/codex-review-round2/`) 결과, 그리고 「용량이 아니라 큐 개념」이라는 지시를 반영한 통합 설계다. 동시성 · 취소 · CPU 블로킹은 한 문제다: 동기 CPU 작업이 이벤트 루프를 잡으면 취소 신호 · 시한 타이머 · 대기 큐가 돌지 못하고 LLM 호출 발행도 늦어진다. 그래서 따로 고치지 않고 **하나의 실행 모델**로 푼다.

## 최상위 제약

**성능을 높인다. 추론(채팅 · 임베딩) 서버로 나가는 요청의 병렬성과 유효 처리량을 줄이지 않는다.**

1. 설계가 동시 요청 수를 임의로 낮추지 않는다(실행별 몫 상한 없음, 실행 수 상한 없음, 자동 감소 없음, 큐 길이 상한으로 인한 거절 없음).
2. **실행 가능한 작업이 있고 해당 큐의 소비자가 비어 있는 일이 없다.** 큐 + pull 구조에서 이것은 구조의 결과이되, ready 큐와 지연 큐를 분리하고 재시도 시각에 소비자를 깨워야 성립한다(아래 「큐 구조」).
3. 이벤트 루프를 막아 발행이 늦어지는 것도 병렬성 손실이다(제거 대상).
4. 취소 · 시한은 낭비 작업을 없애는 용도이며 정상 작업을 느리게 하지 않는다.

**소비자 수의 기본값은 비열화를 증명한 값이 아니다.** 기존 동시성은 프로세스 수에 비례했다(HTTP 3 + stdio 세션마다 3, 임베딩은 무제한). 소비자 수는 배포 설정이고, 기본값은 관찰된 배포 형태(HTTP 1 + stdio 2 세션) 이상으로 잡으며, 수용 시험에서 기존 대비 처리량이 떨어지지 않는지 **측정으로** 확인한다.

## 핵심 모델: 큐에 담고, 소비자가 당겨 간다

```
 생산자(실행의 단계들)        큐(종류별)                  소비자(당겨 간다)
 ──────────────────      ───────────────────────     ───────────────────────────
 계획 · 증강 · 조사원 ─▶  infer.chat     ─────────▶   비동기 소비자 N개 (시도 하나를 끝까지 await)
 모든 요청을 그대로 담는다  infer.embed    ─────────▶   비동기 소비자 M개
 (거절 없음)               collect.web    ─────────▶   비동기 소비자 2개 (덕덕고 요청)
                           collect.store  ─────────▶   비동기 소비자 6개 (pgvector · 폴더 DB 조회)
                           collect.crawl  ─────────▶   비동기 소비자 2개 (크롤러 조사원)
                           collect.codebase ───────▶   비동기 소비자 2개 (코드베이스 조사원)
                           cpu.search     ─────────▶   스레드 1개(색인 캐시 소유)
                           cpu.build      ─────────▶   스레드(작업 단위, 최대 W개)
                           cpu.regex      ─────────▶   스레드 1개(종료 가능)
```

* **큐는 모든 요청을 순서대로 받는다.** 길이 상한도, busy 거절도 없다. **부하의 상한은 소비자 수**다.
* 소비자 수(설정, 환경 변수): `DUALCONTEXT_CHAT_WORKERS` 기본 **9**, `DUALCONTEXT_EMBED_WORKERS` 기본 **32**, 조사원 수집 큐는 종류별로 `DUALCONTEXT_COLLECT_WEB_WORKERS` 기본 **2**, `DUALCONTEXT_COLLECT_STORE_WORKERS` 기본 **6**, `DUALCONTEXT_COLLECT_CRAWL_WORKERS` 기본 **2**, `DUALCONTEXT_COLLECT_CODEBASE_WORKERS` 기본 **2**, `DUALCONTEXT_CPU_WORKERS`(`cpu.build` 동시 작업 수) 기본 `min(2, cpus-1)`(최소 1). `cpu.search` 와 `cpu.regex` 는 전용 스레드 하나씩이며 `cpu.build` 의 수에 포함되지 않는다.
* **소비자 루프는 시도 하나를 끝까지 기다린다**:

  ```
  while (open) { const task = await queue.pull(); await attempt(task); }   // attempt 는 자원 정리까지 await
  ```

  재시도가 필요하면 `attempt` 가 작업을 **지연 큐에 다시 넣고 즉시 반환**해 소비자를 돌려준다. 최초 `submit` 의 Promise 는 최종 결과까지 유지된다.
* 설계가 보장하는 것은 「소비자 수 ≥ 동시에 발행되는 요청 수」다. 전체 RSS 는 소비자 수가 아니라 대기 중인 payload 가 정한다(「메모리」).

### 큐 구조 (작업 보존)

* **ready 큐**: 실행(`runId`)별 FIFO 와, 비어 있지 않은 실행들의 순환 목록. 소비자가 당길 때 순환 목록의 다음 실행의 선두 작업을 가져간다(공정성은 순서일 뿐 몫 상한이 아니다. 한 실행만 남으면 그 실행이 모든 소비자를 쓴다). 실행별 FIFO 에는 **ready 작업만** 들어간다(선두가 지연 작업이라 뒤의 ready 작업을 막는 일이 없다).
* **지연 큐**: `notBefore` 가 미래인 작업의 최소 힙과 타이머 하나. 시각이 되면 ready 로 옮기고 **쉬는 소비자를 깨운다**. 소비자가 모두 자고 있어도 타이머가 깨운다.
* **우선순위 클래스**: `foreground`(실행의 질의 필수 작업) > `background`(백그라운드 갱신 · 백필 · 실행 외 호출). 가장 오래 기다린 background 작업이 30초를 넘으면 foreground 취급으로 올린다(aging, 기아 방지).
* **작업 상태기계**: `queued → running → settled`, `queued → delayed → queued`. 모든 작업은 **정확히 한 번** settle 한다.
  * 취소(`queued`/`delayed`): 큐 · 힙에서 제거, 타이머 해제, `RunAborted` 로 reject. 이후 재투입 금지.
  * 취소(`running`): 신호를 abort 하고, 소비자는 `attempt` 가 정리를 마치고 settle 한 뒤에야 다음을 당긴다(로컬 실행이 겹치지 않는다).
  * 완료 · 재투입 · 취소가 겹치면 먼저 상태를 바꾼 쪽이 이기고, 진 쪽은 아무것도 하지 않는다(`state` 확인 후 전이).
* 병렬 분기는 `Promise.all` 의 조기 reject 에 의존하지 않고 **시작한 분기 전부가 정착한 뒤** 결과를 낸다(`settleAll`).

### 메모리

대기 작업의 payload 는 이미 메모리에 있는 프롬프트 문자열 · 입력 배열의 **참조**이며, settle 시 참조를 제거한다. 큐 길이는 제한하지 않는다(요청 접수를 거절하지 않는다). 생산자(플래너의 아이템 · 라운드 상한)가 수를 묶는다. 계측: 대기 작업 수 · 대기 payload 바이트 추정. 실행 종료 스냅샷은 최대 50개 · 60초 TTL.

## 현황 근거(코드로 확인한 것)

* 채팅 제한기는 `createModelClient` 인스턴스마다 생성된다(`model/index.ts:24`). HTTP 와 stdio 프로세스가 각자 만들어 합산되지 않는다. 임베딩 호출에는 제한이 없다. 재시도 대기는 슬롯을 쥔 채다(`model/index.ts:75`).
* 재시도 두 겹: 모델 층 503/429 4회와 계획 층 `withAttempts` 4회(모든 오류, 대기 없음). 계획 호출 하나가 최대 HTTP 16회.
* 실행 취소 신호가 없다(`startRun` → `execute`). 개별 HTTP 제한용 신호만 있다.
* `index.ts:27` 이 `connect()` 뒤에 `transport.onclose` 를 덮어쓴다.
* 보관 삭제 쿼리에 `status` 조건이 없다(`lifecycle/index.ts:174`).
* 서버 빌드는 `src/server/index.ts` 하나만 번들한다(`package.json` `build:server`). 컨테이너 이미지에 `node_modules` 가 없다(`Dockerfile:27-40`).
* 동기 CPU: robots 정규식, import 정규식(파일 전체 `m`), 제목 정규식, `extractJson`, 코드베이스 색인 `JSON.parse`(읽기에 크기 제한 없음), 크롤러 JS 코사인, trace · patch 직렬화, 응답 `response.json()`.

## 설계

### 1. 실행 컨텍스트 `RunContext`

* 실행마다 `AbortController` 와 종료 사유 `reason: "cancelled" | "deadline" | "shutdown"`.
* **`RunAborted` 는 `dualcontext_domain/common` 에 정의**한다(도메인이 앱을 import 하지 않는다). 모든 fallback 경계(조사원 실패 흡수, 키워드 폴백, writer 기본 조립, dedupe 폴백)는 `RunAborted` 를 삼키지 않고 다시 던진다.
* **모델 façade**: 실행마다 `ctx.model` 을 만들어 `Deps.model` 로 넘긴다. façade 는 `chat`/`embed` 를 해당 큐에 `submit` 하며 `runId` · 신호 · 우선순위를 자동으로 붙인다(시그니처 `Promise<string>` / `Promise<number[][]>` 유지). 실행 밖 호출(관리자 미리보기 · 검색 임베딩 · 백필)은 신호 없는 전역 façade 로 `background` 클래스를 쓴다.
* **모델 밖의 취소 전달**: 수집 포트에 `signal` 을 추가한다. `fetch` 는 신호를 받고, 파일 · 폴더 읽기는 파일 사이에서 신호를 확인하며, DB 쿼리처럼 취소할 수 없는 대기는 `raceAbort(promise, signal)` 로 **분기를 즉시 끝내고**(원 작업은 짧게 끝나므로 고아로 둔다) 큐 소비자를 반환한다. 공유 작업(색인 빌드 · 크롤 · 임베딩 백필)은 실행 신호가 아니라 **자기 신호**를 쓰고 요청은 기다림에서 detach 한다.
* 시한(deadline)은 **선택 예산**이다. 기본 없음. `DUALCONTEXT_BUDGET_<EFFORT>_S` 로만 켠다.
  * **시한 만료의 반환 경로**: 플래너의 `planContext` 최상위가 `RunAborted(deadline)` 를 잡아 **클로저 안의 graph 로 부분 컨텍스트를 조립**해 `{ context, trace(stop: "deadline"), partial: true }` 로 반환한다. 조립할 것이 없으면 오류. 형제 분기가 정착한 뒤에 확정한다. 계획 모드가 아닌 classic 은 오류.
  * MCP envelope: `stop === "deadline"` 이면 모든 effort 에서 `coverage=partial` 과 종료 사유(`reason: deadline`)를 낸다.
  * 사용자 취소 · 종료: 결과를 돌려주지 않는다(SDK 가 취소된 요청의 응답을 보내지 않는다). 저장 · 정리만 한다.
* **종료 순서**: 생산자 정착(`settleAll`) → 저장기 `close()`(새 push 차단, 대기분 flush) → 실행 소유 부수 작업(진행 기록 큐 · 질의 임베딩) 정착 → 종료 상태 UPDATE(`where id = $1 and status = 'running'`) → 종료 publish. 정리는 **유한 예산**(기본 5초)으로 돌고, 초과하면 남은 쓰기를 버리고(저장기는 닫혀 있어 늦은 쓰기가 종료 상태를 덮지 않는다) 종료 상태를 확정한다. 종료 기록 UPDATE 가 실패하면 성공으로 publish 하지 않고 메모리 스냅샷에 오류를 둔다. 사용자 취소 · 종료 기록: `status='error'`, `error='취소됨(<사유>)'`.
* DB: `pg` 쿼리는 신호로 취소되지 않는다. 짧은 쿼리는 그대로 두고, 오래 걸릴 수 있는 쿼리(크롤러 검색 · 폴더 검색)는 `statement_timeout`(세션 단위, 30초)을 둔다.

### 2. 추론 큐(`infer.*`)

* 위 핵심 모델의 구현이다. 하나의 프로세스(엔진 소유자)에 `chat` 큐와 `embed` 큐가 있다(서버가 다르므로 독립).
* 자동 감소 없음. 계측: 소비자별 in-flight · 큐 길이 · 대기 시간 · 발행 수 · 실행별 현황 · 대기 payload 바이트. `/api/admin/status` 에 노출.
* **재시도 한 층**: 일시적 오류(네트워크, 502/503/429, 유휴 타임아웃)만 최대 4회, 지연 재투입(지수 백오프 + 지터). `RunAborted` 와 스트림 가드 위반은 재시도하지 않는다. 계획 층 `withAttempts` 제거. **파싱 · 계약 실패**는 같은 프롬프트로 1회만 다시 담는다(서버 비결정성 대비, 정책으로 명시): analyze 실패 = 실행 오류, dedupe 실패 = 폴백, evaluate 실패 = 현재 동작 유지.
* **호출 기록**: `recordModel` 은 논리 호출 하나에 `attempts`(시도 수)를 기록한다(작업 결과가 시도 수를 돌려준다). 기존 시도별 기록을 기대하는 시험은 이 계약으로 바꾼다.
* **스트림 가드**: 수신 **중** 바이트 상한(채팅 누적 content, 프레임 길이, 오류 본문 4KB, 임베딩 응답 8MB, 크롤러 응답 16MB). 상한을 넘으면 중단하고 비재시도 오류. `[DONE]` 후 스트림을 닫는다. 비스트리밍 `response.json()` 은 상한이 있는 스트림 읽기로 대체한다.
* 로컬 abort 와 원격 계산 종료는 다르다: 원격 잔존은 확인 수단이 없으므로 지표에서 `unknown`, 로컬 취소 건수와 구별.

### 3. 단일 엔진 소유자와 stdio 중계

* HTTP 서버 프로세스가 엔진을 소유한다: 큐 · 소비자, 실행 레지스트리 `Map<runId, RunContext>`, 상태 갱신 합치기. **큐가 하나의 프로세스에 모이므로 처음으로 전역이 된다.**
* **stdio 분기는 `index.ts` 에서 DB 초기화보다 먼저** 갈라진다. stdio 프로세스는 엔진 · DB · 모델 클라이언트를 만들지 않고, **내부 전용 listener**(`127.0.0.1:<DUALCONTEXT_INTERNAL_PORT>` 명시 바인딩, compose 에서 게시하지 않음, `env.ts` 검증)의 `POST /internal/augment` 로 중계한다. 클라이언트 설정(`docker exec … --stdio`)은 그대로다. 서버가 없으면 명확한 오류, 직접 실행 폴백 없음.
* 중계 응답은 줄 단위 JSON 스트림(첫 줄 `{runId}`, 진행 줄, 마지막 결과 또는 오류). stdio 쪽은 전용 undici dispatcher(헤더 · 본문 타임아웃 없음).
* 연결 이탈: **`response.on("close")` 이면서 `!response.writableEnded`**(요청 `close` 는 정상 완료에도 발생). 요청 본문 파싱보다 앞에서 감시한다. 본문 수신 중 중단, runId 발급 전 취소, 완료 직전 취소를 모두 다룬다.
* stdio MCP 프로세스(SDK 1.32.2 실측 반영):
  * `connect()` 뒤 `transport.onclose` 를 덮어쓰지 않고 체인한다.
  * **stdin EOF**: SDK 의 stdio transport 는 EOF 에서 `onclose` 를 부르지 않는다 → `process.stdin.on("end")` 에서 중계 fetch 전부 abort 후 `transport.close()`.
  * **요청 ID 0 취소**: SDK 가 falsy ID 를 건너뛴다 → `transport.onmessage` 를 래핑해 `notifications/cancelled` 의 `requestId === 0` 를 직접 처리해 해당 요청의 신호를 abort 한다.
  * `notifications/cancelled` 와 연결 종료는 중계 fetch 를 abort 하고 서버 실행을 취소한다.
  * **한계(문서화)**: 클라이언트가 `maxTotalTimeout` · 요청 시간 초과로 포기해도 취소 알림이나 연결 종료가 없으면 서버는 모른다 → 선택 시한 예산이 안전장치.
* **MCP 진행 알림**: `extra._meta.progressToken` 이 있을 때만, 서버 진행 이벤트마다와 15초마다 `notifications/progress`(단조 증가 `progress`, `message`)를 보낸다. 클라이언트가 `onprogress` 를 등록하고 `resetTimeoutOnProgress` 를 켠 경우에만 1분 제한이 연장된다. 비동기 작업 조회 계약은 이번 범위가 아니다.
* 종료(SIGTERM): 신규 접수 중지 → 전체 실행 abort(shutdown) → 유한 drain(5초) → SSE · 연결 종료 → 큐 소비자 · pool · 워커 종료.

### 4. CPU 작업

**크기 · 반복 상한이 있는 알고리즘으로 교체**(정직한 복잡도를 적고 의미 회귀 시험을 둔다)

* robots 매칭: 정규식 제거. 패턴을 `*` 로 나눈 리터럴 조각을 **왼쪽부터 최초 위치에 탐욕 배치**(`indexOf`, 첫 조각은 접두 일치, `$` 면 마지막 조각은 접미 일치). 글롭 존재 판정에서 탐욕 배치는 정확하다. 복잡도는 O(경로 × 조각 길이 합)이며 **선형이 아니다**; 상한으로 묶는다: 경로 2048자 · 패턴 256자 · 그룹당 규칙 200개. 규칙 선택(최장 일치, 동률 Allow 우선)은 현재 `isAllowed` 의미를 유지한다.
* import 추출: 줄 단위로 읽되 **여러 줄 상태**(`require(`, Go `import ( … )`, JS 다중 줄 import)를 유지하는 스캐너. 줄 길이 상한을 4000자로 두며(기존 정규식은 무제한) 이를 초과하는 줄의 import 는 무시한다(동작 변경으로 선언).
* 크롤러 제목: 줄 길이 상한 + 비정규식.
* `extractJson`: 의미 보존을 위해 알고리즘은 유지하되 **상한을 둔다**: 여는 괄호 후보 최대 64개, 입력 길이 최대 200,000자(초과 시 앞 200,000자만). 최악 O(64 × 200,000). 후보 선택 · 중첩 복구 · 깨진 opener 복구 의미는 기존 시험으로 고정하고, 64개 밖 후보를 보지 않는 것은 동작 변경으로 선언한다.

**스레드 소비자(`node:worker_threads`)**

* 빌드: esbuild 진입점을 추가해 `dist/server/workers/<이름>.js` 로 출력한다(`--outdir` + 명시적 진입점 이름, 서버 번들 `import.meta.url` 기준 URL). 서버 엔트리를 워커로 실행하지 않는다. 검증은 컨테이너에 복사되는 `dist` 만으로 한다.
* `cpu.search`(전용 스레드 1개, 색인 캐시 소유):
  * 취소는 **협력적**: 메인이 공유 `Int32Array` 취소 플래그를 켜면 검색 루프가 용어 · 후보 단위로 확인해 중단한다(스레드를 죽이지 않는다).
  * 캐시 무효화: 질의마다 색인 파일 `stat`(mtime · size)을 확인해 바뀌었으면 다시 읽는다(원자적 교체 `rename` 과 맞다). 메인의 `hasIndex` 는 파싱하지 않고 `stat` 만 한다.
  * 메모리: 워커에 `resourceLimits.maxOldGenerationSizeMb`(기본 768)를 걸고, LRU 의 크기 추정은 파일 바이트 × 4. 초과 · OOM 이면 워커를 재시작한다.
  * 메인에는 topK 자료만 전달한다(64MB 복제 없음). 읽기 경로에도 색인 크기 상한(64MB)을 둔다.
* `cpu.build`(작업 단위 스레드, 동시 최대 `CPU_WORKERS`): 스캔 · 심볼 · 그래프. 취소 · 시한 시 `terminate`(종료 완료를 기다린다), 임시 경로는 작업 id 로 분리하고 부모가 정리한다. git 클론은 메인에서 `spawn`(비동기)하며 부모가 추적 · 종료한다. 질의 경로의 cold 빌드와 갱신은 같은 큐에서 foreground/background 로 구분되고, `cpu.search` 는 별도 스레드라 밀리지 않는다.
* `cpu.regex`(전용 스레드 1개, 종료 가능): 페이지당 링크 묶음 하나가 작업 하나. 대상 길이 상한 2048, 작업 시한 200ms 초과 시 `terminate` 후 스레드 재생성, 해당 링크는 제외.
* **크롤러 코사인은 DB 에서 계산**(스레드 아님). 계약:
  ```sql
  with c as materialized (
    select c.url, p.title, c.text, c.idx, c.embedding
      from crawl_chunks c join crawl_pages p using (researcher_id, url)
     where c.researcher_id = $1 and c.embedding_key = $2 and array_length(c.embedding, 1) = $3
  ), s as (
    select *, case when ... zero-vector ... then 0 else 1 - (embedding::vector <=> $4::text::vector) end as score from c
  ), r as (
    select *, row_number() over (partition by url order by score desc, idx) as rn from s where score >= $5
  )
  select ... from r where rn <= $6 order by score desc, url, idx limit $7
  ```
  `materialized` CTE 로 차원 조건이 캐스트보다 먼저 평가되게 한다. 질의 벡터는 `[a,b,c]` 문자열로 바인딩한다. 영벡터 · NaN 은 점수 0 으로 처리(기존 JS 의미). 저장 시 차원 · 유한값 검증. 순위 의미는 기존과 같다(유사도 → minScore → 페이지당 perPage → 전체 topK, 동률은 url · idx). JS `cosine` 과 SQL 점수를 고정 입력에서 허용 오차(1e-5) 내로 비교하는 시험을 둔다.

**메인에 남는 동기 후처리의 경계**

* 응답 파싱은 위 스트림 가드의 바이트 상한 안에서만 한다. trace 직렬화는 상한이 있는 필드 크기(`NODE_TEXT_LIMIT`)를 쓰고, 수용 시험에서 **이벤트 루프 지연 p99 < 50ms**(`monitorEventLoopDelay`)를 확인한다. 넘으면 직렬화를 워커로 옮긴다(측정 후 결정).

### 5. 상태 전달

* 단일 소유자이므로 기존 `bus` 위에서 **갱신 합치기**(선두 + 후미, 최대 지연 500ms)를 하고 SSE 의 DB 2초 폴링을 제거한다. 종료 상태는 즉시 flush. `publish` 는 구독자가 있을 때만 `readRun` 을 한다. 직렬화는 이벤트당 한 번이고 구독자가 공유한다. 단조 증가 `revision`.
* 종료 publish 가 실패해도 종료 스냅샷은 **메모리**(TTL 60초, 최대 50개)에 남아 재접속에 준다. SSE 느린 소비자는 `write` 반환값을 보고 최신 상태만 남긴다.
* trace 저장은 **표본** 계약(1초 주기 직렬화, 종료 시 최종 즉시). node patch 는 push 후 **불변**으로 취급한다(어댑터가 patch 안의 객체를 이후에 변경하지 않는다, 시험으로 고정). 깊은 복사는 제거.
* `onProgress` 의 DB 기록은 비동기 큐로 분리해 플래너의 발행을 막지 않는다.
* 프론트: 노드 문서 폴링은 **실행이 진행 중인 동안만**, 변화가 없으면 4 → 15초로 백오프한다. 실행이 끝나면 **마지막 한 번** 가져온다(노드 상태만 보고 멈추지 않는다).

### 6. DB · 보관

* 보관 삭제는 종료된 행만 대상으로 최근 500개를 계산한다(`status <> 'running'`).
* 풀 4 → 10(설정), `connectionTimeoutMillis`, 풀 `error` 핸들러. 헬스체크는 풀 없는 liveness 와 DB 확인을 분리한다.
* `embedPending`: 단일 비행 키 = (조사원 id, **임베딩 endpoint + 모델**)이고, 시작 시 설정을 한 번 읽어 **고정한 클라이언트**로 끝까지 호출한다. 청크 UPDATE 는 읽은 텍스트와 같을 때만 적용한다(텍스트 일치 + 키 고정).
* 폴더 조사원: 총 바이트 예산을 **실행 단위**로 공유(기본 20MB). 크롤 첫 실패 뒤 60초 백오프. DB 의 tsvector 열 추가는 효과를 측정한 뒤 판단한다(이번 범위 밖).
* 크롤러 컨테이너로 가는 요청은 `io.crawl` 소비자 수(기본 4)가 상한이고, 이 값은 비열화가 입증된 값이 아니며 수용 시험에서 확인한다.

### 7. 병렬화로 얻는 추가 처리량

순차 구간(조사원별 수집 · 프로시저 선택 `D/augment/index.ts:56-78`, `per_pair` 라이터 `:114`, 하위 질의 라우팅 `select.ts:41`)을 의존성이 없는 만큼 병렬화한다(결과 순서는 입력 순서로 고정). 생산자는 작업을 큐에 담기만 하고 동시 수는 소비자 수가 정한다. 수집은 `io.collect` 큐를 지난다.

### 8. 프론트

숨은 탭에서 폴링 중지(`document.hidden`), 폴링 요청에 `AbortController`, 의미 검색 질의 임베딩 캐시(키 = 질의 + 임베딩 모델 식별자, 동시 요청 단일 비행), 언어 번들 지연 로딩.

## 배포 경계(기능 순서가 아니라 의존 묶음)

| 묶음 | 범위 | 활성화 조건 |
| --- | --- | --- |
| 실행 종료 계약 | `RunContext` · façade · `RunAborted` · fallback · 저장기 close/flush · 종료 순서 · 보관 삭제 | 취소 뒤 추가 호출 · 늦은 저장 · 잘못된 성공 상태 없음 |
| 큐와 소비자 | `infer.*` · `io.*` · 상태기계 · 지연 재투입 · 단일 재시도 · 스트림 가드 · 계측 | 기존 합산 부하 대비 동시성 · 유효 처리량 비열화(측정) |
| CPU 격리 | 상한 있는 알고리즘 · 워커 빌드 · `cpu.*` · SQL 코사인 | `dist` 만으로 실행 · 검색 지연 유지 |
| stdio 중계 | 내부 listener · 중계 · 취소 · 진행 알림 · 서버 미기동 오류 | 위 묶음 충족 |
| 상태 전달 | 갱신 합치기 · 표본 trace · 프론트 | 모든 실행이 단일 소유자로 전환 |

부분 배포하지 않는다. 같은 변경 안에서 단위 시험과 합산 검증을 거친 뒤 함께 낸다.

## 검증 계획

* 병렬성: 동시 호출 N · 한 실행의 다수 요청 · 채팅/임베딩 별도 서버 · 대기 실행 소멸. 큐에 ready 작업이 있으면 소비자 수만큼 in-flight 를 유지하고, 지연 작업은 시각에 깨운다. 재시도 백오프 중에도 소비자가 놀지 않는다.
* 큐 상태기계: 취소 vs 당김 · 재투입 · 완료의 모든 경쟁에서 settle 이 정확히 한 번, 타이머 해제, 취소 후 재투입 없음. aging 으로 background 기아 없음.
* 취소 경쟁: 큐 대기 중 · 당겨 간 직후 · 본문 수신 중 · 분기 일부 완료 · 최종 저장 중. 소비자 이중 해제 없음, 종료 이후 쓰기 없음, 정리 예산 초과 처리.
* MCP/HTTP: 정상 POST close, 응답 중 disconnect, 취소 알림, **요청 ID 0**, **stdin EOF**, progress 미지원, `maxTotalTimeout`, 서버 미기동, 서버 재시작.
* CPU: ReDoS 회귀(시간 단언), robots/import/`extractJson` 의미 회귀(변경 선언 항목 포함), 워커 종료 후 복구, `dist` 단독 실행, SQL vs JS 코사인 일치.
* 성능 판정(변경 전후 같은 조건): in-flight 평균 · 최대, **완료한 유효 작업/초 · 성공률 · coverage · 대기 시간 · p95/p99 · 이벤트 루프 지연 · RSS**. 병렬성이 떨어지면 불합격이다.

## v5 개정 (3회차 리뷰 반영, v4 를 대체)

1. **작업 상태기계(재시도 · 취소 포함)**: 작업 상태 `queued | running | delayed | settled`, 시도마다 `attemptId`. 전이: `queued→running`(당김), `running→delayed`(일시 오류 재시도, 시도 정리 완료 뒤), `delayed→queued`(시각 도래), `*→settled`. **취소는 되돌릴 수 없는 표식**이다(`cancelled=true`): 표식 이후의 완료 · 재투입 · 타이머 만료는 모두 무시하고 `RunAborted` 로 정확히 한 번 settle 한다. 늦게 도착한 옛 `attemptId` 의 완료는 거부한다. 작업 하나의 실패는 소비자 루프를 끝내지 않는다(`try/catch` 로 감싸고 다음을 당긴다). 종료(`close`) 시 대기 중인 `pull()` 을 모두 깨운다.
2. **지연 큐 타이머**: 최솟값이 바뀔 때마다(삽입 · 취소 · 만료) 타이머를 다시 건다. 만료 콜백은 상태를 재확인한 뒤 ready 로 옮기고 쉬는 소비자를 깨운다. aging 기준 시각은 **최초 제출 시각**이고 재시도해도 유지되며, 승격된 background 작업은 foreground 실행 큐의 **뒤**에 붙는다. 실행별 순환 목록은 빈 큐를 즉시 제거하고 재삽입 시 중복을 막는다.
3. **리프 전용 규칙**: **소비자를 쥔 작업은 다른 큐의 작업을 기다리지 않는다.** 큐에 들어가는 것은 리프 작업(요청 하나, 파일 읽기 하나, 쿼리 하나)이며, 여러 리프를 엮는 오케스트레이션(조사원 수집 · 크롤 후 백필)은 **생산자 쪽**에서 돈다. 따라서 `io.collect` 는 수집 전체가 아니라 **외부 I/O 리프**(웹 fetch · 폴더 파일 읽기 · 검색 SQL)만 처리한다. 수집 안의 LLM 호출(검색어 재작성)은 `infer.chat` 에 직접 간다(수집 슬롯을 쥐지 않는다). 크롤은 `io.crawl` 의 네트워크 리프, 백필(`embedPending`)은 크롤이 끝난 뒤 생산자가 따로 제출하는 별도 작업이다(중첩 제출 금지).
4. **종료 시 DB 쓰기 소유권**: 실행 소유 쓰기 전부(진행 · trace · 노드 · 답변 · 최종)는 `RunWriter` 를 통해서만 나가고, `RunWriter.close()` 뒤에는 새 SQL 을 발행하지 않는다. 이미 발행된 SQL 이 늦게 끝나도 덮어쓰지 않도록 **모든 실행 소유 UPDATE/UPSERT 에 `status = 'running'` 조건**을 둔다(노드 UPSERT 는 `insert … select … where exists (select 1 from augment_runs where id = $1 and status = 'running')`). 정리 예산(5초) 안에 종료 UPDATE 가 확정되지 않으면 **메모리상 종료**와 **DB 종료 미확정**을 구별한다: 허브는 메모리 스냅샷(`persisted:false`)으로 종료를 구독자에게 보내고, 백그라운드에서 종료 UPDATE 를 제한적으로 재시도하며, 끝내 실패하면 다음 기동의 `abandonRunningRuns` 가 닫는다. 검색 쿼리 시한은 세션이 아니라 **체크아웃한 연결의 `SET LOCAL statement_timeout`**(트랜잭션 안)으로 건다.
5. **MCP 취소는 transport 어댑터가 소유**한다: `StdioServerTransport` 를 감싸 (a) `onmessage` 에서 요청 수신 **즉시** `tools/call` 의 id 를 등록하고, (b) `notifications/cancelled`(요청 ID 0 포함)를 직접 처리해 해당 요청의 중계 컨트롤러를 abort 하며, (c) 취소된 id 의 응답은 `send` 단계에서 **버린다**(SDK 응답 억제가 중계 신호와 연결되지 않으므로), (d) stdin `end` 에서 전부 abort 후 `close()` 한다. SDK 가 `onmessage` 를 설치한 **뒤**, 입력을 받기 **전**에 래핑한다. 시험은 SDK 1.32.2 로 실제 재현한다.
6. **SQL 코사인 계약**: 저장 시와 질의 시 모두 (1) 1차원 배열, (2) NULL · NaN · ±Infinity 없음, (3) float32 로 표현 가능한 범위, (4) 차원 일치를 검증한다. 검증하지 못한 기존 행은 `array_length` · `NULL` 검사를 materialized CTE 안에 두어 제외한다. 점수는 `1 - distance`, 양쪽 영벡터나 결과가 NaN 이면 0. 이는 기존 JS `cosine`(차원 불일치를 앞 차원만 비교, NaN 전파)과 **다른 동작이며 수정으로 선언**한다. 동점은 `url, idx` 로 결정적으로 정렬한다(기존 조회 순서 의존을 대체). 완성된 SQL 은 구현에서 실제 쿼리 텍스트로 고정하고 정상 범위에서 JS 와 1e-5 내 일치를 시험한다.
7. **임베딩 설정 고정**: 크롤 백필 · 크롤 검색의 질의 벡터 · `embedding_key` 가 **같은 resolved 설정**(작업 시작 때 한 번 읽은 endpoint · 모델)을 쓴다. 키는 기존 형식(모델 이름)을 유지해 배포 때 청크가 다시 임베딩되는 일을 피하고, endpoint 만 바뀌는 경우는 알려진 한계로 둔다. 라우팅 캐시 · 실행 질의 임베딩의 같은 경합은 잔여 문제로 문서화한다.
8. **`cpu.search`**: 검색 스레드 수를 설정(`DUALCONTEXT_SEARCH_WORKERS` 기본 2)으로 두고 **색인 키 해시로 스레드에 고정**해 캐시 중복을 피한다. 검색기 구축(cold)에도 취소 확인을 넣고 warm 검색과 구분해 측정한다. generation = 색인 파일의 `mtimeMs + size + ino` 와 파싱한 `builtAt`. `resourceLimits` 는 힙만 제한하므로 RSS 는 계측한다.
9. **trace 크기**: `NODE_TEXT_LIMIT` 은 trace 전체의 상한이 아니다. 직렬화 크기 · 시간을 계측하고 p99 이벤트 루프 지연 기준(50ms)을 넘으면 워커로 옮긴다. 추론 입력을 줄여 해결하지 않는다. 실행 종료 시 레지스트리 · 리스너 · 타이머 · 완료 작업 참조를 해제한다.
10. **종료 publish**: 종료 결과는 DB 재조회 없이 **허브가 메모리에서 확정**해 기존 구독자에게도 보낸다. 종료 뒤에는 후미 타이머를 취소하고, 진행 중이던 옛 조회가 `running` 을 publish 하지 못하게 revision 으로 거른다.
11. **정규식 작업 단위**: `cpu.regex` 작업은 링크 최대 50개 묶음이다. 시한(200ms)은 워커가 시작을 알린 뒤부터 잰다. 초과하면 `terminate` 하고 **그 묶음의 링크는 모두 제외**한다(보수적). robots 는 선택된 그룹을 합친 뒤의 규칙 총량(최대 200)을 넘으면 앞쪽 규칙만 쓴다.
12. **호출 기록**: façade 는 `chat(prompt): Promise<string>` 과 함께 `chatDetailed(prompt): Promise<{ text, attempts }>` 를 제공하고 `recordModel` 이 후자를 쓴다(전역 상태 없음). 논리 호출 = 파싱 재생성 포함(파싱 실패 시 재생성 1회), 네트워크 시도는 생성 한 번당 최대 4회. 실패 기록에도 `attempts` 를 남긴다.
13. **deadline 부분 결과**: `PlanStop` 에 `deadline` 을 추가하고 `RunAugmentOutcome.partial` 로 전달한다. HTTP 시험 실행은 deadline 뒤 최종 답변(증강 전 · 후) 호출을 하지 않고 부분 결과를 저장한다. 형제 분기에 일반 오류와 `RunAborted` 가 함께 나오면 종료 사유는 `RunAborted` 가 이긴다.
14. **구현 범위 조정**: 언어 번들 지연 로딩 · 의미 검색 질의 캐시 · tsvector 열 재설계는 이번 변경에서 **뺀다**(후속). 임의 정규식 격리 · 수신 중 바이트 제한 · 취소 전파와 분기 정착 · 종료 쓰기 정합성은 포함한다.

## 구현 현황과 설계 대비 편차 (2026-11-19)

구현됨(시험 · 배포 · 실서버 확인은 `tests/reports/execution-model/`): 큐와 소비자(`queue/`: ready 순환 · 지연 큐 · 상태기계 · aging), 추론 게이트웨이(`model/`: 채팅 9 · 임베딩 32 소비자, 일시 오류만 지연 재투입 4번, 스트림 가드, `forRun` · `pinned` · `background`), 실행 컨텍스트(`run/`: 신호 · 사유 · 레지스트리 · 선택 시한), `RunAborted` 와 모든 fallback 의 재던지기, `settleAll`/`settled`, 시한 부분 결과(`stop=deadline`), 종료 순서와 `RunWriter`(종료 뒤 쓰기 차단 · `status = 'running'` 조건), 표본 trace, 보관 삭제에서 진행 중 실행 제외, MCP stdio 중계(내부 listener · transport 어댑터 · 진행 알림 · 취소), SSE 의 DB 폴링 제거와 갱신 합치기 · 종료 스냅샷, 조사원 수집 · 라이터 병렬화, 선형화(robots · import · 제목 · `extractJson` 예산), 스레드 소비자(`workers/`: `cpu.search` · `cpu.build` · `cpu.regex`), 크롤러 DB 코사인, 공유 작업 detach · 임베딩 설정 고정(`ModelClient.pinned`), DB 풀 · 헬스체크 전용 풀, 프론트 폴링 개선, 상태 API 계측 · 운영자 취소 엔드포인트.

설계와 다르게 구현했거나 이번에 하지 않은 것:

* **조사원 수집 큐는 설계(`io.collect` · `io.crawl` 두 개)와 다르게 네 종류로 구현했다**(2026-11-19, `server/collect/queues/`): `web`(덕덕고) · `store`(pgvector · 폴더) · `crawl`(크롤러) · `codebase`. 같은 `createTaskQueue` 이므로 모든 요청을 받고 부하의 상한은 종류별 소비자 수다. 계기: 질의분해 · 재평가 실행에서 아이템(저장 한도 16) × 조사원(아이템당 최대 4)이 제한 없이 동시에 발동했다(웨이브의 모든 아이템과 선택된 조사원 모두 `settleAll` 로 한꺼번에 시작). 수집기는 큐를 거치며, 작업이 받는 신호가 취소 신호다(큐에서 빠지거나 실행 중이면 abort). 실행별 라운드로빈 공정성의 키는 실행 번호다. 의존 방향은 일방향이다: 수집 작업은 모델 큐를 기다릴 수 있지만 모델 큐는 수집 큐를 기다리지 않아 순환 대기가 없다. 웹 검색만은 검색어 재작성(모델 호출)을 큐 밖에서 끝내고 외부 요청 하나만 큐에 넣어 리프 전용 규칙을 지킨다. 나머지 세 종류는 수집기 전체(임베딩 · 클론 · 색인 포함)가 큐 작업 하나이므로 리프 전용이 아니다(위 일방향성이 deadlock 이 없는 근거다). **기본 소비자 수는 측정으로 정한 값이 아니다**(호스트 부하 억제를 우선한 보수적 값이며 `store` 는 DB 풀 10 에서 실행 기록 쓰기 몫을 남기려고 6). 같은 실행 안에서 한 종류가 소비자보다 많이 몰리면 그만큼 기다리므로 지연이 늘 수 있다.
* **크롤러 컨테이너 요청 직렬화(전역 1)는 하지 않았다**(기존의 조사원 단위 단일 비행 + 위 `crawl` 큐 소비자 수 2).
* **`cpu.search` 취소는 협력적**이며 검색기 구축(cold)에도 플래그 확인이 있다. 비협력 구간의 최대 지연은 측정하지 않았다.
* **tsvector 구성요소별 열 · 언어 번들 지연 로딩 · 의미 검색 질의 캐시**는 이번 범위에서 뺐다(v5 개정 14).
* 시한 예산(`DUALCONTEXT_BUDGET_<EFFORT>_S`)은 기본 없음이고, 부분 결과 경로는 시험으로만 확인했다(실서버에서 시한을 걸고 돌려 보지 않았다).
* 요청 ID 0 취소 · stdin EOF 는 SDK 1.32.2 기준이다. SDK 가 고치면 어댑터의 해당 분기는 중복이 된다(무해).
* 원격 계산 종료(upstream) 는 확인 수단이 없어 지표에 없다(로컬 취소 건수만 `queues.*.cancelled`).

## 제한 사항

* 클라이언트가 시간 초과로 포기하면서 취소 알림이나 연결 종료를 보내지 않으면(`maxTotalTimeout` 등) 서버 실행은 계속된다. 취소가 관찰되는 경우에만 서버도 취소된다.
* 진행 알림은 `onprogress` + `resetTimeoutOnProgress` 를 쓰는 클라이언트에서만 시간 제한을 연장한다.
* 시한 예산의 기본값은 측정 뒤에 정한다.
* 로컬 abort 는 upstream 추론 서버의 계산 종료를 보장하지 않는다.
* robots · import · `extractJson` 에는 선언한 동작 변경이 있다.
