# 아키텍처

| 경로 | 계약 | 드릴다운 |
| --- | --- | --- |
| `src/server/index.ts` | 진입. 기본값을 시드한 뒤 `--stdio` 면 MCP stdio, 아니면 HTTP(헬스 + 관리자 + 프런트). | `src/server/index.ts` |
| `src/server/app.ts` | Express 앱. `/health`, `/api/admin`, 정적 서빙. | `createApp` |
| `src/server/mcp` | MCP 서버. 도구 `augment_context` 하나. 입력 `query` + 선택 `effort`, 응답은 고정 머리 + 컨텍스트. `tools/augment`(도구 등록 · 진행 알림 · 취소 신호 결합), `tools/augment/effort`(effort → 모드 · `maxRounds`), `tools/augment/envelope`(응답 머리 · coverage · 오류 한 줄), `tools/augment/run`(엔진 소유 프로세스의 로컬 실행기), `relay`(stdio 프로세스가 서버의 내부 listener 로 중계), `transport`(SDK transport 를 감싼 취소 어댑터: 요청 수신 즉시 신호 등록 · 요청 ID 0 취소 · 응답 억제). | `mcp/index.ts`, `mcp/tools/augment`, `mcp/relay`, `mcp/transport` |
| `src/server/augment` | 증강 진입점 `runAugment`(MCP 와 시험 실행이 공유): 모드가 `classic` 이면 `base/` 의 한 번의 기본 증강(도메인 `augmentQuery` 에 저장소 · 라우팅 · 수집 · 라이터 포트를 채운다), 계획 모드면 도메인 `planContext` 를 부르고 결과를 `AugmentResult` 로 바꾼다(`planResult`). `base/` 를 따로 둔 것은 계획기 어댑터가 이것을 가져가 순환 import 를 피하려는 것이다. | `augment/index.ts#runAugment`, `augment/base/index.ts#augment` |
| `src/server/plan` | 컨텍스트 계획기의 앱 어댑터. `prompts/`(기본 프롬프트 4종, JSON 응답 스키마 · 데이터 구분자 포함, `legacy/` 는 옛 기본값 = 저장 행 승격 비교 기준), `parse/`(기대 스키마에 맞는 JSON 후보 선택 · 항목 검증 · 길이 상한 · 점수 클램프 · 평가 형식 오류는 던짐), `ports/`(`createPlanPorts`: 채팅 모델 · 답변 프롬프트 · 기본 증강으로 `PlanPorts` 를 채우고 아이템별 원본 결과를 기록), `provided/`(사전 컨텍스트의 중첩 섹션 제거 · 길이 상한), `config/`(설정 스키마 · 기본값 · `plan_config` 읽기/쓰기 · 실행 한 번 override). 플래너 자체는 도메인(`dualcontext_domain/server#planContext`). | `plan/ports/index.ts#createPlanPorts` |
| `src/server/routing` | 라우터 설정대로 질의를 나누고 조사원/프로시저를 고른다. 하위 폴더: `config`(설정 스키마 · 기본값 · 옛 설정 변환 · 프롬프트), `pipeline`(단계 파이프라인 실행), `steps/{embedding,keyword,llm}`(단계 종류별 구현), `split`(질의 분해). 임베딩 캐시. 개별 라우터가 있는 조사원은 전역 후보에서 빼고 각자의 단계 파이프라인으로 따로 판정한 뒤 합친다(`selectResearchers`). | `routing/index.ts` |
| `src/server/collect` | 조사원 타입별 수집기 폴더: `duckduckgo`, `pgvector`, `folder`, `codebase`. | `collect/index.ts` |
| `src/server/collect/codebase` | 코드베이스 조사원(레포 클론 또는 볼륨 폴더 → 심볼 · 호출 · import 구조 인덱스 → 질의). 하위 폴더: `config`(설정 스키마), `guard`(URL · SSRF · ref · 경로 검증), `clone`(얕은 git 클론), `scan`(안전한 파일 순회), `symbols`(언어별 정의 · import 추출), `graph`(구조 인덱스 · import 해석), `rank`(BM25 + 호출 이웃 보강), `store`(볼륨 안 JSON 인덱스), `format`(자료 변환), `model`(인덱스 타입), `acquire`(질의 · 인덱스 만들기 요청 · 진행 중 중복 방지 · 실패 백오프 · 갱신 정책 — 인덱스를 읽지 않고 검색 스레드에 질의한다), `projects`(폴더 아래 하위 프로젝트 인식 · 이름 선택 · 병합). `build.ts` 가 만들기(클론은 메인, 스캔 · 심볼 · 그래프 · 쓰기는 빌드 스레드), `index.ts` 가 진입. `symbols/imports.ts` 는 줄 단위 import 스캐너(정규식 폭주 방지). 결정 근거는 `internals.md`. | `collect/codebase/index.ts` |
| `src/server/collect/queues` | 조사원 수집의 종류별 작업 큐(`web` · `store` · `crawl` · `codebase`)와 소비자 수 설정. 수집 진입점(`collect/index.ts`)이 조사원 타입에 맞는 큐로 보낸다. 모든 요청을 받고 부하의 상한은 소비자 수다. | `collect/queues/index.ts` |
| `src/server/collect/abort` · `collect/timeout` | 수집기의 취소 규약(`isAbort` · `throwIfAborted` · `raceAbort`)과 시한 있는 쿼리(`withStatementTimeout`: 체크아웃한 연결의 `begin; set local statement_timeout; …; commit`). | `collect/abort/index.ts` |
| `src/server/workers` | CPU 격리 스레드 소비자(`node:worker_threads`). 하위 폴더: `search`(색인 키 해시로 고정되는 검색 스레드 · 색인 캐시 · 협력 취소), `build`(작업 단위 빌드 스레드 · foreground/background 2단계), `regex`(임의 정규식 전용 스레드 하나), `pool`(작업 장부 · 종료 등록), `thread`(스레드 기동 · 종료 확인), `location`(번들 기준 워커 URL), `config`(환경 변수 설정), `testing`(풀 시험용 가짜 스레드), `dist-check`(dist 단독 실행 확인). esbuild 진입점은 각 폴더의 `worker.ts` 이며 `dist/server/workers/<이름>.js` 로 나온다. | `workers/index.ts` |
| `src/server/collect` | 조사원 타입별 수집기 폴더: `duckduckgo`, `pgvector`, `folder`, `crawler`. `crawler/` 는 역할별 하위 폴더(`config` 설정·상한, `guard` SSRF 방어, `robots`(정규식 없는 매칭), `chunk`, `client` 크롤러 컨테이너 REST 클라이언트, `walk` 너비 우선 크롤, `embedding` 임베딩 설정 고정 · 벡터 검증, `store` 캐시·백필·DB 코사인 검색)로 나뉜다. | `collect/index.ts`, `collect/crawler/index.ts` |
| `src/server/writer` | 라이터 설정을 `{mode, write}` 로 바꾼다(LLM 실패 시 기본 조립으로 대체). 계획기의 사전 컨텍스트는 템플릿이면 「사전 제공된 컨텍스트」 섹션, LLM 이면 프롬프트에 넣는다(`fillWriterPrompt`). | `writer/index.ts` |
| `src/server/model` | AI 서버 클라이언트(임베딩 · LLM, OpenAI 호환). 호출은 `queue/` 의 작업 큐에 담기고 소비자가 당겨 간다(채팅 · 임베딩 각자의 큐, 모든 요청을 받는다). `chat/`(스트리밍, 유휴 시간 기준 중단, 수신 중 바이트 상한), `stream/`(SSE 해석 · 스트림 가드), `retry/`(일시 오류 분류 · 백오프)로 나눈다. `forRun` 은 실행에 바인딩된(runKey · 취소 신호) façade 를 돌려준다. | `model/index.ts` |
| `src/server/queue` | 큐와 소비자: 실행별 라운드로빈 ready 큐(`ring.ts`) · 재시도 지연 큐(`delayed.ts`) · 작업 상태기계(정확히 한 번 settle, 취소는 되돌릴 수 없는 표식) · aging. | `queue/index.ts` |
| `src/server/run` | 실행 컨텍스트(취소 신호 · 종료 사유 · 선택 시한)와 활성 실행 레지스트리. | `run/index.ts` |
| `src/server/internal` | 엔진 소유 서버의 내부 전용 listener(`POST /internal/augment`, 줄 단위 JSON 스트림, 연결 이탈 = 실행 취소). MCP stdio 프로세스가 중계한다. | `internal/index.ts` |
| `src/server/metrics` | 이벤트 루프 지연 계측. | `metrics/index.ts` |
| `src/server/admin` | 관리 API. 엔티티별 폴더: `researchers`, `procedures`, `router`, `writers`, `ai-server`, `plan`(계획 설정 `GET/PUT /plan/config` · `GET /plan/defaults`), `runs`(시험 실행 로그: `index.ts` 는 라우터, `lifecycle/` 실행 · 진행 방송 · 정리, `list/` 목록 — `params/` 입력 검증, `query/` SQL 빌더, `filters/` 필터 이름, `semantic/` 의미 검색 상수 — , `embedding/` 질의 임베딩 저장 · 백필), `crawl`(크롤러 조사원의 상태·지금 크롤·캐시 지우기). | `admin/index.ts` |
| `src/server/seed` | 기본 라우터 · 라이터 · AI 서버 값과 사전 정의 프리셋(한 번만). | `seed/index.ts` |
| `src/server/db` | 커넥션 풀과 상태 조회. | `db/index.ts` |
| `src/front` | Vite React 관리자. `features/*` 폴더마다 화면과 `resource.ts`. 왼쪽 메뉴 셸은 `main.tsx`(해시의 첫 마디로 화면을 고른다). | `main.tsx` |
| `src/front/features/runs` | 실행 로그. 폴더 단위: `route`(해시 `#runs` · `#runs/<id>` · `#runs/<id>/node/<키>` 해석), `query`(목록 조건 · 쪽 계산, 순수), `api`(목록 · 필터 · 삭제 · 노드 상세 `loadNode` 호출), `format`, `status`, `list`(목록 화면 · `item` · `pager` · `filters`(`multi` · `search`)), `view`(뷰 화면 · `phase` · `summary`(+ `execution` 실행 계획 줄) · `workbench` · `node-screen`). `view/workbench` 가 상세의 본체(서브탭 없음): `model`(실행 상세 → 노드 · 간선 · 분류 그래프, 순수, 테스트), `layout`(일반 DAG 층 배치 · 가로/세로 · 분류 그래프 틀, 순수, 테스트), `canvas`(SVG 캔버스 · `node` · `labels` · `label`), `use-node-detail`(노드 상세 문서 읽기), `panel`(오른쪽 패널 · `kinds/<종류>`(query · analyze · item · classic · answer · evaluate) · `parts`(section · text-box · calls · context · routing · researchers · augment-detail · dedupe-calls · doc-status · node-link · plan-summary) · `rows`(계획 단계 한 줄 표시)). `node-screen` 은 노드 하나만 전체 화면으로 보는 새 창 화면. 폴더마다 자기 `resource.ts`. | `features/runs/index.tsx` |
| `src/front/features/researchers` | 조사원 관리. 실행 로그처럼 목록과 뷰가 분리된다. 폴더 단위: `route`(`#researchers` · `#researchers/new` · `#researchers/<id>`), `query`(검색 · 정렬 조건, 걸러내기 · 쪽 나누기, 순수), `summary`(유형별 출처 한 줄 요약, 순수), `use-researchers`(목록 · 프로시저 · 개별 라우터 기본 프롬프트 읽기), `list`(검색 폼 `filters` · 2줄 항목 `item` · `pager`), `form`(편집 폼 + `model`(폼 값 ↔ 요청 본문, 순수)), `crawler`. 목록은 `GET /researchers` 한 번으로 전체를 읽고 걸러내기 · 정렬 · 쪽 나누기는 화면이 한다(조사원은 수백 개 이하라 서버 쪽 조회 API 를 두지 않았다). 폴더마다 자기 `resource.ts`. | `features/researchers/index.tsx` |
| `src/front/features/plan` | 컨텍스트 계획기 설정 화면(`#plan`). `api`(GET/PUT `/plan/config`, GET `/plan/defaults`, 400 본문의 검증 문장 추출, 옛 저장값에 빠진 필드를 기본값으로 채우는 `withPlanDefaults`), `mode`(모드 3택), `limits`(분해 한도 · 사전 컨텍스트 반영 글자 수 · 중복 정리), `reevaluate`(재평가 한도, 저장 모드가 reevaluate 가 아니어도 편집 가능하고 안내만 붙는다), `prompts`(프롬프트 4종 · 칸별 「기본값으로」). 설정 값은 다른 관리 화면처럼 화면 로컬 상태(서버 캐시)다. | `features/plan/index.tsx` |
| `src/front/features/try` | 시험 실행. `mode` 하위 폴더가 이번 실행의 컨텍스트 모드 선택(「저장 설정 따름」 + 3모드, 고르면 `POST /augment` 에 `mode`). | `features/try/index.tsx` |
| `src/front/components/plan-progress` | 「계획 진행 중: <단계>」 줄. 실행 상세 최상위 `planProgress`(계획이 멈추기 전, `plan` 이 없거나 부분 trace 일 때)를 보인다. 실행 로그 뷰와 시험 실행이 공유. | `components/plan-progress/index.tsx` |
| `src/front/components/plan-labels` | 모드 · 정지 사유(`PlanStop`) · 아이템 상태 · 진행 단계(`planProgress.stage`) 라벨. 계약 값마다 키 하나(`Record`)라 값이 늘면 컴파일 오류가 난다. 설정 · 시험 실행 · 실행 로그가 공유. | `components/plan-labels/index.ts` |
| `docker/` | 이미지, 엔트리포인트, DB 초기화 SQL(`initdb/`, 크롤러 캐시 테이블은 `004_crawler.sql`, 실행 로그 검색 열 · 트리거 · 인덱스는 `005_runs_search.sql`, 조사원 기본 프로시저 열 · 외래키는 `006_researcher_default_procedure.sql`, 계획 설정 테이블과 실행 로그 `plan` · `plan_progress` 열은 `007_plan.sql`). | `docker/Dockerfile` |
| `seed-data/` | 허깅페이스 데이터셋 적재 스크립트(호스트에서 실행). | `load-datasets.mjs` |

## 컨테이너 하나, 프로세스 둘, 볼륨 하나

`docker/entrypoint.sh` 가 PostgreSQL(pgvector + mecab-ko 한국어 전문 검색)을 먼저 띄우고 준비되면 Node 를 띄운다.
어느 쪽이든 종료하면 다른 쪽도 내리고 컨테이너가 종료한다. 둘 다 비루트 `postgres` 사용자로 돈다.
볼륨 `dualcontext_data` 하나를 `/var/lib/postgresql/data` 에 마운트하고 영속 대상은 하위 폴더로 나눈다(현재 `pgdata/`).

## 데이터 모델

| 테이블 | 내용 |
| --- | --- |
| `researchers` | 조사원. `type` + `config(jsonb)`, 키워드, 라우팅 임베딩 캐시, `default_procedure_id`(기본 프로시저, `procedures(id)` `ON DELETE SET NULL`) |
| `procedures` | 프로시저(독립). 이름 유일 |
| `researcher_procedures` | 조사원이 소유하는 프로시저 연결(순서 포함) |
| `plan_config` | 1행(`id=1`). `config` jsonb 에 계획 설정(`ContextPlanConfig`: 모드 · 한도 · 통과조건 · 프롬프트 4종). 기본 행은 서버 시작 시 코드가 넣는다(`ensurePlanConfig`, 기본 `classic`) |
| `router_config` | 1행. `pipeline` jsonb 에 질의 분해와 1단계(조사원) · 2단계(프로시저)의 라우팅 단계 목록 전체(옛 단일 방법 열은 변환용으로만 남음) |
| `writers` | 라이터. 엔진 · 호출 방식 · 프롬프트, 활성은 최대 1개 |
| `ai_server` | 1행. 임베딩/LLM 서버 주소 · 모델 · (쓰기 전용) API 키 |
| `augment_runs` | 시험 실행 로그. 질의 · 상태 · 소요 시간 · 라우팅 방법 · 설정 스냅샷(jsonb) · 쌍과 자료(jsonb) · 컨텍스트. 최근 500건만 보관. 목록용 파생 열(트리거가 채움): `researcher_names` · `procedure_names`(text[], GIN), `search_tsv`(tsvector, GIN), `query_embedding`(double precision[]) + `embedding_key`(임베딩 모델 이름). 계획 모드 실행은 `plan`(jsonb, `PlanTrace`)과 진행 중 `plan_progress`(jsonb `{stage, detail?, at}`)를 더 남긴다 |
| `augment_run_nodes` | 실행 그래프 노드별 상세(`run_id` + `key` 가 기본 키, `detail` jsonb, `augment_runs` 삭제 시 cascade). 프롬프트 · 응답 · 조사원 자료 · 라우팅처럼 무거운 내용을 실행 행(과 그 SSE 방송)에 넣지 않으려 따로 둔다. `docker/initdb/008_run_nodes.sql`(시작 때마다 멱등 적용). 쓰는 곳: `src/server/admin/runs/nodes`(저장기 · 읽기), 호출 기록기는 `src/server/plan/calls`. |
| `ds_*` | 사전 정의 테이블형 조사원의 데이터. `embedding vector(768)` 와 `embedding_mrl vector(256)`, HNSW 는 후자에만 |
| `crawl_state` · `crawl_pages` · `crawl_chunks` | 크롤러 조사원의 캐시. 조사원 1개당 상태 1행, 페이지(URL 별 내용 해시), 청크(텍스트 + `double precision[]` 임베딩 + 만든 모델 이름). 조사원이 지워지면 함께 지워진다 |
| `seed_state` | 일회성 시드 표식 |

## 크롤러 조사원과 크롤러 컨테이너

```
질의 ─ collectCrawler ─ 캐시 있음? ─ 예 ─▶ DB 코사인 검색(상위 조각, SQL 한 번) ─▶ 자료
                           │ 아니오(또는 크롤 대상 설정이 바뀜)         ▲
                           ▼                                            │ 갱신 주기를 넘겼으면 백그라운드 재크롤
                walk(너비 우선): URL 마다 SSRF 검사 → 허용 도메인 → robots.txt → 호스트별 간격
                           │                          → 크롤러 컨테이너 POST /crawl (Chromium 렌더링 → 마크다운)
                           ▼                          → 최종 URL 재검사 → 링크 추출
                chunk(제목·문단 경계) ─ store(내용 해시가 같은 페이지는 임베딩 재사용) ─ 임베딩 서버
```

* 크롤러 컨테이너(`apps/crawler`, 공식 Crawl4AI 이미지)는 **렌더링과 마크다운 변환만** 한다. 어디를 갈지(깊이·도메인·robots·간격·SSRF·상한)는 전부 dualcontext 서버(`collect/crawler/walk`)가 결정하고, 크롤러에는 검사를 통과한 URL 하나씩만 보낸다.
* 캐시는 dualcontext 의 DB 에 둔다(볼륨 하나 규칙 유지). 크롤러 컨테이너는 상태가 없고 볼륨이 없다.
* 진행 중인 크롤은 프로세스 메모리의 `Map<researcherId, Promise>` 하나(키 = `researchers.id`, 크롤 한 번이 끝나면 지운다, 크기는 조사원 수 이하)로 묶어 같은 조사원의 크롤이 겹치지 않게 한다. 크롤 · 임베딩 백필 · 코드 인덱스 빌드는 **공유 작업**이라 요청의 취소 신호로 죽지 않는다(요청은 기다림에서만 떨어진다). 백필의 단일 비행 키는 (조사원 id, 임베딩 모델)이고, 크롤 첫 실패 뒤 60초 동안은 질의가 크롤을 되풀이하지 않는다.
* 코사인 순위는 **DB** 가 계산한다(`store/search.ts` 의 `searchSql`: 차원 · NULL · 비유한 선필터가 든 `materialized` CTE → `1 - (embedding <=> 질의)` → `minScore` → 페이지별 `perPage` → `topK`). 질의 벡터는 `[a,b,c]` 문자열로 바인딩하고, 체크아웃한 연결의 `set local statement_timeout = 30000` 안에서 돈다. 임베딩 설정(endpoint · 모델)은 작업 시작 때 한 번 읽어 고정하고(`embedding/`), 백필 UPDATE 는 읽은 텍스트와 같을 때만(`and text = $6`) 적용한다.
* include/exclude 정규식은 관리자가 쓴 임의 정규식이라 메인에서 돌리지 않는다: 페이지의 링크를 50개 묶음으로 `workers/regex` 스레드에 보내고, 묶음이 200ms 안에 안 끝나면 스레드를 끝내고 그 묶음의 링크를 전부 제외한다.
