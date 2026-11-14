# 아키텍처

| 경로 | 계약 | 드릴다운 |
| --- | --- | --- |
| `src/server/index.ts` | 진입. 기본값을 시드한 뒤 `--stdio` 면 MCP stdio, 아니면 HTTP(헬스 + 관리자 + 프런트). | `src/server/index.ts` |
| `src/server/app.ts` | Express 앱. `/health`, `/api/admin`, 정적 서빙. | `createApp` |
| `src/server/mcp` | MCP 서버. 도구 `augment_context` 하나. | `mcp/tools/augment` |
| `src/server/augment` | 도메인 `augmentQuery` 에 포트(저장소 · 라우팅 · 수집 · 라이터)를 채우는 한 곳. MCP 와 시험 실행이 공유. | `augment/index.ts` |
| `src/server/routing` | 라우터 설정대로 질의를 나누고 조사원/프로시저를 고른다. 하위 폴더: `config`(설정 스키마 · 기본값 · 옛 설정 변환 · 프롬프트), `pipeline`(단계 파이프라인 실행), `steps/{embedding,keyword,llm}`(단계 종류별 구현), `split`(질의 분해). 임베딩 캐시. | `routing/index.ts` |
| `src/server/collect` | 조사원 타입별 수집기 폴더: `duckduckgo`, `pgvector`, `folder`. | `collect/index.ts` |
| `src/server/writer` | 라이터 설정을 `{mode, write}` 로 바꾼다(LLM 실패 시 기본 조립으로 대체). | `writer/index.ts` |
| `src/server/model` | AI 서버 클라이언트(임베딩 · LLM, OpenAI 호환). 채팅은 `chat/`(스트리밍, 유휴 시간 기준 중단), `stream/`(SSE 해석), `limit/`(동시 호출 제한 · 503/429 재시도)로 나눈다. | `model/index.ts` |
| `src/server/admin` | 관리 API. 엔티티별 폴더: `researchers`, `procedures`, `router`, `writers`, `ai-server`, `runs`(시험 실행 로그). | `admin/index.ts` |
| `src/server/seed` | 기본 라우터 · 라이터 · AI 서버 값과 사전 정의 프리셋(한 번만). | `seed/index.ts` |
| `src/server/db` | 커넥션 풀과 상태 조회. | `db/index.ts` |
| `src/front` | Vite React 관리자. `features/*` 폴더마다 화면과 `resource.ts`. 왼쪽 메뉴 셸은 `main.tsx`. | `main.tsx` |
| `docker/` | 이미지, 엔트리포인트, DB 초기화 SQL(`initdb/`). | `docker/Dockerfile` |
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
| `seed_state` | 일회성 시드 표식 |
