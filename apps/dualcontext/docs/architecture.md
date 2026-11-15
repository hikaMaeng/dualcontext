# 아키텍처

| 경로 | 계약 | 드릴다운 |
| --- | --- | --- |
| `src/server/index.ts` | 진입. 기본값을 시드한 뒤 `--stdio` 면 MCP stdio, 아니면 HTTP(헬스 + 관리자 + 프런트). | `src/server/index.ts` |
| `src/server/app.ts` | Express 앱. `/health`, `/api/admin`, 정적 서빙. | `createApp` |
| `src/server/mcp` | MCP 서버. 도구 `augment_context` 하나. | `mcp/tools/augment` |
| `src/server/augment` | 도메인 `augmentQuery` 에 포트(저장소 · 라우팅 · 수집 · 라이터)를 채우는 한 곳. MCP 와 시험 실행이 공유. | `augment/index.ts` |
| `src/server/routing` | 라우터 설정대로 질의를 나누고 조사원/프로시저를 고른다. 하위 폴더: `config`(설정 스키마 · 기본값 · 옛 설정 변환 · 프롬프트), `pipeline`(단계 파이프라인 실행), `steps/{embedding,keyword,llm}`(단계 종류별 구현), `split`(질의 분해). 임베딩 캐시. 개별 라우터가 있는 조사원은 전역 후보에서 빼고 각자의 단계 파이프라인으로 따로 판정한 뒤 합친다(`selectResearchers`). | `routing/index.ts` |
| `src/server/collect` | 조사원 타입별 수집기 폴더: `duckduckgo`, `pgvector`, `folder`, `codebase`. | `collect/index.ts` |
| `src/server/collect/codebase` | 코드베이스 조사원(레포 클론 또는 볼륨 폴더 → 심볼 · 호출 · import 구조 인덱스 → 질의). 하위 폴더: `config`(설정 스키마), `guard`(URL · SSRF · ref · 경로 검증), `clone`(얕은 git 클론), `scan`(안전한 파일 순회), `symbols`(언어별 정의 · import 추출), `graph`(구조 인덱스 · import 해석), `rank`(BM25 + 호출 이웃 보강), `store`(볼륨 안 JSON 인덱스), `format`(자료 변환), `model`(인덱스 타입). `build.ts` 가 만들기, `index.ts` 가 질의 · 갱신 정책. 결정 근거는 `internals.md`. | `collect/codebase/index.ts` |
| `src/server/collect` | 조사원 타입별 수집기 폴더: `duckduckgo`, `pgvector`, `folder`, `crawler`. `crawler/` 는 역할별 하위 폴더(`config` 설정·상한, `guard` SSRF 방어, `robots`, `chunk`, `client` 크롤러 컨테이너 REST 클라이언트, `walk` 너비 우선 크롤, `store` 캐시·임베딩·검색)로 나뉜다. | `collect/index.ts`, `collect/crawler/index.ts` |
| `src/server/writer` | 라이터 설정을 `{mode, write}` 로 바꾼다(LLM 실패 시 기본 조립으로 대체). | `writer/index.ts` |
| `src/server/model` | AI 서버 클라이언트(임베딩 · LLM, OpenAI 호환). 채팅은 `chat/`(스트리밍, 유휴 시간 기준 중단), `stream/`(SSE 해석), `limit/`(동시 호출 제한 · 503/429 재시도)로 나눈다. | `model/index.ts` |
| `src/server/admin` | 관리 API. 엔티티별 폴더: `researchers`, `procedures`, `router`, `writers`, `ai-server`, `runs`(시험 실행 로그), `crawl`(크롤러 조사원의 상태·지금 크롤·캐시 지우기). | `admin/index.ts` |
| `src/server/seed` | 기본 라우터 · 라이터 · AI 서버 값과 사전 정의 프리셋(한 번만). | `seed/index.ts` |
| `src/server/db` | 커넥션 풀과 상태 조회. | `db/index.ts` |
| `src/front` | Vite React 관리자. `features/*` 폴더마다 화면과 `resource.ts`. 왼쪽 메뉴 셸은 `main.tsx`. | `main.tsx` |
| `docker/` | 이미지, 엔트리포인트, DB 초기화 SQL(`initdb/`, 크롤러 캐시 테이블은 `004_crawler.sql`). | `docker/Dockerfile` |
| `seed-data/` | 허깅페이스 데이터셋 적재 스크립트(호스트에서 실행). | `load-datasets.mjs` |

## 컨테이너 하나, 프로세스 둘, 볼륨 하나

`docker/entrypoint.sh` 가 PostgreSQL(pgvector + mecab-ko 한국어 전문 검색)을 먼저 띄우고 준비되면 Node 를 띄운다.
어느 쪽이든 종료하면 다른 쪽도 내리고 컨테이너가 종료한다. 둘 다 비루트 `postgres` 사용자로 돈다.
볼륨 `dualcontext_data` 하나를 `/var/lib/postgresql/data` 에 마운트하고 영속 대상은 하위 폴더로 나눈다(현재 `pgdata/`).

## 데이터 모델

| 테이블 | 내용 |
| --- | --- |
| `researchers` | 조사원. `type` + `config(jsonb)`, 키워드, 라우팅 임베딩 캐시 |
| `procedures` | 프로시저(독립). 이름 유일 |
| `researcher_procedures` | 조사원이 소유하는 프로시저 연결(순서 포함) |
| `router_config` | 1행. `pipeline` jsonb 에 질의 분해와 1단계(조사원) · 2단계(프로시저)의 라우팅 단계 목록 전체(옛 단일 방법 열은 변환용으로만 남음) |
| `writers` | 라이터. 엔진 · 호출 방식 · 프롬프트, 활성은 최대 1개 |
| `ai_server` | 1행. 임베딩/LLM 서버 주소 · 모델 · (쓰기 전용) API 키 |
| `augment_runs` | 시험 실행 로그. 질의 · 상태 · 소요 시간 · 라우팅 방법 · 설정 스냅샷(jsonb) · 쌍과 자료(jsonb) · 컨텍스트. 최근 500건만 보관 |
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
