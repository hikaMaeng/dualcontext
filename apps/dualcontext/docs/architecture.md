# 아키텍처

| 경로 | 계약 | 드릴다운 |
| --- | --- | --- |
| `src/server/index.ts` | 진입. 기본값을 시드한 뒤 `--stdio` 면 MCP stdio, 아니면 HTTP(헬스 + 관리자 + 프런트). | `src/server/index.ts` |
| `src/server/app.ts` | Express 앱. `/health`, `/api/admin`, 정적 서빙. | `createApp` |
| `src/server/mcp` | MCP 서버. 도구 `augment_context` 하나. | `mcp/tools/augment` |
| `src/server/augment` | 증강 진입점 `runAugment`(MCP 와 시험 실행이 공유): 모드가 `classic` 이면 `base/` 의 한 번의 기본 증강(도메인 `augmentQuery` 에 저장소 · 라우팅 · 수집 · 라이터 포트를 채운다), 계획 모드면 도메인 `planContext` 를 부르고 결과를 `AugmentResult` 로 바꾼다(`planResult`). `base/` 를 따로 둔 것은 계획기 어댑터가 이것을 가져가 순환 import 를 피하려는 것이다. | `augment/index.ts#runAugment`, `augment/base/index.ts#augment` |
| `src/server/plan` | 컨텍스트 계획기의 앱 어댑터. `prompts/`(기본 프롬프트 4종, JSON 응답 스키마 · 데이터 구분자 포함, `legacy/` 는 옛 기본값 = 저장 행 승격 비교 기준), `parse/`(기대 스키마에 맞는 JSON 후보 선택 · 항목 검증 · 길이 상한 · 점수 클램프 · 평가 형식 오류는 던짐), `ports/`(`createPlanPorts`: 채팅 모델 · 답변 프롬프트 · 기본 증강으로 `PlanPorts` 를 채우고 아이템별 원본 결과를 기록), `provided/`(사전 컨텍스트의 중첩 섹션 제거 · 길이 상한), `config/`(설정 스키마 · 기본값 · `plan_config` 읽기/쓰기 · 실행 한 번 override). 플래너 자체는 도메인(`dualcontext_domain/server#planContext`). | `plan/ports/index.ts#createPlanPorts` |
| `src/server/routing` | 라우터 설정대로 질의를 나누고 조사원/프로시저를 고른다. 하위 폴더: `config`(설정 스키마 · 기본값 · 옛 설정 변환 · 프롬프트), `pipeline`(단계 파이프라인 실행), `steps/{embedding,keyword,llm}`(단계 종류별 구현), `split`(질의 분해). 임베딩 캐시. 개별 라우터가 있는 조사원은 전역 후보에서 빼고 각자의 단계 파이프라인으로 따로 판정한 뒤 합친다(`selectResearchers`). | `routing/index.ts` |
| `src/server/collect` | 조사원 타입별 수집기 폴더: `duckduckgo`, `pgvector`, `folder`, `codebase`. | `collect/index.ts` |
| `src/server/collect/codebase` | 코드베이스 조사원(레포 클론 또는 볼륨 폴더 → 심볼 · 호출 · import 구조 인덱스 → 질의). 하위 폴더: `config`(설정 스키마), `guard`(URL · SSRF · ref · 경로 검증), `clone`(얕은 git 클론), `scan`(안전한 파일 순회), `symbols`(언어별 정의 · import 추출), `graph`(구조 인덱스 · import 해석), `rank`(BM25 + 호출 이웃 보강), `store`(볼륨 안 JSON 인덱스), `format`(자료 변환), `model`(인덱스 타입), `acquire`(인덱스 얻기 · 진행 중 중복 방지 · 갱신 정책), `projects`(폴더 아래 하위 프로젝트 인식 · 이름 선택 · 병합). `build.ts` 가 만들기, `index.ts` 가 진입. 결정 근거는 `internals.md`. | `collect/codebase/index.ts` |
| `src/server/collect` | 조사원 타입별 수집기 폴더: `duckduckgo`, `pgvector`, `folder`, `crawler`. `crawler/` 는 역할별 하위 폴더(`config` 설정·상한, `guard` SSRF 방어, `robots`, `chunk`, `client` 크롤러 컨테이너 REST 클라이언트, `walk` 너비 우선 크롤, `store` 캐시·임베딩·검색)로 나뉜다. | `collect/index.ts`, `collect/crawler/index.ts` |
| `src/server/writer` | 라이터 설정을 `{mode, write}` 로 바꾼다(LLM 실패 시 기본 조립으로 대체). 계획기의 사전 컨텍스트는 템플릿이면 「사전 제공된 컨텍스트」 섹션, LLM 이면 프롬프트에 넣는다(`fillWriterPrompt`). | `writer/index.ts` |
| `src/server/model` | AI 서버 클라이언트(임베딩 · LLM, OpenAI 호환). 채팅은 `chat/`(스트리밍, 유휴 시간 기준 중단), `stream/`(SSE 해석), `limit/`(동시 호출 제한 · 503/429 재시도)로 나눈다. | `model/index.ts` |
| `src/server/admin` | 관리 API. 엔티티별 폴더: `researchers`, `procedures`, `router`, `writers`, `ai-server`, `plan`(계획 설정 `GET/PUT /plan/config` · `GET /plan/defaults`), `runs`(시험 실행 로그: `index.ts` 는 라우터, `lifecycle/` 실행 · 진행 방송 · 정리, `list/` 목록 — `params/` 입력 검증, `query/` SQL 빌더, `filters/` 필터 이름, `semantic/` 의미 검색 상수 — , `embedding/` 질의 임베딩 저장 · 백필), `crawl`(크롤러 조사원의 상태·지금 크롤·캐시 지우기). | `admin/index.ts` |
| `src/server/seed` | 기본 라우터 · 라이터 · AI 서버 값과 사전 정의 프리셋(한 번만). | `seed/index.ts` |
| `src/server/db` | 커넥션 풀과 상태 조회. | `db/index.ts` |
| `src/front` | Vite React 관리자. `features/*` 폴더마다 화면과 `resource.ts`. 왼쪽 메뉴 셸은 `main.tsx`(해시의 첫 마디로 화면을 고른다). | `main.tsx` |
| `src/front/features/runs` | 실행 로그. 폴더 단위: `route`(해시 `#runs`/`#runs/<id>` 해석), `query`(목록 조건 · 쪽 계산, 순수), `api`(목록 · 필터 · 삭제 호출과 쿼리스트링 구성), `format`, `status`, `list`(목록 화면 · `item` · `pager` · `filters`(`multi` · `search`)), `view`(뷰 화면 · `phase` · `summary` · `tabs`(`answer` · `plan` · `routing` · `researchers` · `context`)). 폴더마다 자기 `resource.ts`. 탭 UI 는 `components/tabs`. `tabs/plan` 은 실행에 `plan` 기록이 있을 때만 나오는 계획 탭: `model`(needs → 들여쓰기 트리 · 공유 노드 접기 · 웨이브 이름, 순수, 테스트), `summary`, `tree`(+ `node`), `levels`, `waves`, `rounds`. | `features/runs/index.tsx` |
| `src/front/features/plan` | 컨텍스트 계획기 설정 화면(`#plan`). `api`(GET/PUT `/plan/config`, GET `/plan/defaults`, 400 본문의 검증 문장 추출, 옛 저장값에 빠진 필드를 기본값으로 채우는 `withPlanDefaults`), `mode`(모드 3택), `limits`(분해 한도 · 사전 컨텍스트 반영 글자 수 · 중복 정리), `reevaluate`(재평가 한도, 저장 모드가 reevaluate 가 아니어도 편집 가능하고 안내만 붙는다), `prompts`(프롬프트 4종 · 칸별 「기본값으로」). 설정 값은 다른 관리 화면처럼 화면 로컬 상태(서버 캐시)다. | `features/plan/index.tsx` |
| `src/front/features/try` | 시험 실행. `mode` 하위 폴더가 이번 실행의 컨텍스트 모드 선택(「저장 설정 따름」 + 3모드, 고르면 `POST /augment` 에 `mode`). | `features/try/index.tsx` |
| `src/front/components/plan-progress` | 「계획 진행 중: <단계>」 줄. 실행 상세 최상위 `planProgress`(진행 중에는 `plan` 이 없다)를 보인다. 실행 로그 뷰와 시험 실행이 공유. | `components/plan-progress/index.tsx` |
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
| `ds_*` | 사전 정의 테이블형 조사원의 데이터. `embedding vector(768)` 와 `embedding_mrl vector(256)`, HNSW 는 후자에만 |
| `crawl_state` · `crawl_pages` · `crawl_chunks` | 크롤러 조사원의 캐시. 조사원 1개당 상태 1행, 페이지(URL 별 내용 해시), 청크(텍스트 + `double precision[]` 임베딩 + 만든 모델 이름). 조사원이 지워지면 함께 지워진다 |
| `seed_state` | 일회성 시드 표식 |

## 크롤러 조사원과 크롤러 컨테이너

```
질의 ─ collectCrawler ─ 캐시 있음? ─ 예 ─▶ 임베딩 유사도 검색(상위 조각) ─▶ 자료
                           │ 아니오(또는 크롤 대상 설정이 바뀜)         ▲
                           ▼                                            │ 갱신 주기를 넘겼으면 백그라운드 재크롤
                walk(너비 우선): URL 마다 SSRF 검사 → 허용 도메인 → robots.txt → 호스트별 간격
                           │                          → 크롤러 컨테이너 POST /crawl (Chromium 렌더링 → 마크다운)
                           ▼                          → 최종 URL 재검사 → 링크 추출
                chunk(제목·문단 경계) ─ store(내용 해시가 같은 페이지는 임베딩 재사용) ─ 임베딩 서버
```

* 크롤러 컨테이너(`apps/crawler`, 공식 Crawl4AI 이미지)는 **렌더링과 마크다운 변환만** 한다. 어디를 갈지(깊이·도메인·robots·간격·SSRF·상한)는 전부 dualcontext 서버(`collect/crawler/walk`)가 결정하고, 크롤러에는 검사를 통과한 URL 하나씩만 보낸다.
* 캐시는 dualcontext 의 DB 에 둔다(볼륨 하나 규칙 유지). 크롤러 컨테이너는 상태가 없고 볼륨이 없다.
* 진행 중인 크롤은 프로세스 메모리의 `Map<researcherId, Promise>` 하나(키 = `researchers.id`, 크롤 한 번이 끝나면 지운다, 크기는 조사원 수 이하)로 묶어 같은 조사원의 크롤이 겹치지 않게 한다.
