# 테스트

## 단위

```sh
npm run test --workspaces
```

* `src/server/app.test.ts`: 헬스(DB 정상 · 장애 503).
* `src/server/collect/collect.test.ts`: 폴더 경로 검증, MRL 축소, 식별자 검증.
* `src/server/collect/codebase/codebase.test.ts`: URL · SSRF 대역 · DNS 재바인딩 · ref · 하위 경로 검증, 클론 인자(토큰이 argv 에 없음 · 환경 격리 · 가림), 스캔(심볼릭 링크 · 비밀 파일 · 상한), 구조 인덱스(심볼 · import · 호출), 검색(호출 이웃 보강), 볼륨 폴더 소스 경로 탈출 거부.
* 코드베이스 실측(자동 테스트 아님): `collectCodebase` 를 공개 레포(expressjs/cors, pallets/flask `src/flask`)로 실제 클론 · 인덱싱 · 질의해 본 기록은 `test/20261115/codebase-researcher_report.md`.
* `src/server/collect/crawler/crawler.test.ts`: SSRF(IPv4/IPv6 차단 대역, 내부 호스트 이름, 스킴·포트·사용자 정보, 이름이 내부 주소로 풀림), robots.txt(그룹 선택, 최장 규칙, 와일드카드, Crawl-delay), 설정 상한과 지문, 링크 정규화, 청크, 랭킹, 갱신 판단, 크롤(깊이·페이지 수·중복·도메인·간격·시간 상한·robots 오류·내부 주소 리다이렉트), 크롤러 응답 변환.
* `src/server/admin/runs/list/list.test.ts` · `src/server/admin/runs/router.test.ts`: 목록 파라미터 검증, 쿼리 빌더(필터 OR · 종류 사이 AND · 검색어 AND, 쪽 offset, 사용자 값은 전부 `$n` 파라미터), `listRuns`(total · page · match, 임베딩 실패는 `EmbeddingUnavailable`), 임베딩 저장 · 백필 상한, 라우터(400 · 503 · `/runs/filters` 순서). 가짜 pool · 가짜 모델.
* `src/server/admin/researchers/default-procedure/index.test.ts`: 기본 프로시저 검증(연결되지 않은 id 는 `400`, 연결 해제와의 모순 `400`, 저장 · 응답에 `defaultProcedureId`). 폴백 동작은 도메인 `augment/index.test.ts`(발동 · 라우팅이 골랐을 때 · 기본 없음 · 비활성/미연결 · 자료 없음 `skipped`).
* `src/server/admin/runs/list/db.test.ts`: **실제 PostgreSQL**(pgvector + textsearch_ko) 필요. `DUALCONTEXT_TEST_DATABASE_URL` 이 있을 때만 돌고 없으면 7건이 건너뛰어진다. 임시 스키마(`dc_runs_test_<pid>`)에 `initdb/*.sql` 을 적용하고 끝나면 지우므로 가리킨 DB 의 기존 테이블은 건드리지 않는다. 005 멱등, 이름 추출, 갱신 쿼리의 트리거 반영, 필터 OR/AND · total, 한국어/영어 FTS, 의미 검색 순위 · 최소 유사도 · 모델/차원 불일치 제외. 이미지에 DB 가 있으므로 `docker run --entrypoint docker-entrypoint.sh -e POSTGRES_PASSWORD=x -p 127.0.0.1:55432:5432 <이미지> postgres` 로 임시 DB 를 띄워 돌린다.
* `src/front/features/runs/**`: 실행 로그 화면의 순수 로직. 목록 쿼리스트링 구성(`api/path.ts`, 가짜 `fetch` 로 `/api/admin/runs?page&pageSize&researcher…&procedure…&q&mode` 와 필터 · 삭제 · 노드 상세 `loadNode`(키 인코딩 · 404 는 null · 그 밖의 실패는 던짐) 경로 확인), 쪽 계산과 필터 변경 시 1쪽 복귀(`query`), 해시 경로 해석(목록 · 뷰 · 노드 화면, 깨진 인코딩 방어: `route`), 이름 합치기 · 초 표기(`format`), 진행 단계(`view/phase`), 컨텍스트 마크다운 판별(`view/workbench/panel/parts/context/markdown.ts`), 실행 상세 → 그래프 변환(`view/workbench/model`: classic · decompose · reevaluate · 옛 실행, 노드 · 간선 종류 · 분류 그래프 묶음과 시간 · fromPlan 으로 합쳐지는 최종 답변 · 진행 중 상태 · 이웃), 일반 DAG 층 배치(`view/workbench/layout`: 층 = 가장 긴 경로 · 순환 · 겹침 없음 · 가로/세로 · 분류 그래프 틀 · 큰 입력). 화면 렌더 자체의 자동 시험은 없다(배포 후 브라우저 검증 몫).
* `src/front/features/plan/api/api.test.ts`: 저장 실패에서 서버 검증 문장 추출(400 + `{error}` 만, 그 밖은 null), 옛 설정에 없는 `maxProvidedChars` 를 기본값으로 채우기(`withPlanDefaults`).
* `src/server/plan/parse/index.test.ts`: 응답 JSON 추출(코드펜스 · 잡설 · 문자열 속 괄호, 기대 스키마에 맞는 후보 선택), 항목 검증 · 이름 중복 · 길이 상한, 중복 정리 번호 · 기존 id 검증, 점수 클램프, 평가 형식 오류(missing 없음 · 배열 아님 · 항목 틀림)는 던짐.
* `src/server/plan/config/index.test.ts`: 기본 설정(classic), 계약 범위, 옛 행 채우기, 실행 한 번 override(숫자 한도만, 저장 설정 불변), 옛 기본 프롬프트 승격(고친 키는 유지).
* `src/server/plan/provided/index.test.ts`: 사전 컨텍스트 중첩 제거(실제 `writeContext` 3단계 사슬에서 아래 단계 자료가 다시 실리지 않음, 섹션 경계 · 여러 섹션 · 머리글 없는 글), 길이 상한과 「(이하 N자 생략)」의 N.
* `src/server/plan/ports/index.test.ts`: build 가 다듬은 사전 컨텍스트(중첩 제거 · 자르기)를 넘김. 가짜 모델로 포트 어댑터(프롬프트 자리표시자, 상한, 실패는 던짐, build 의 아이템 질의 · provided 전달 · 원본 기록, answer 프롬프트, 평가 부족 항목을 자르지 않음, 구분자 무력화 · 주입 문자열이 데이터 구간을 닫지 못함, 기본 프롬프트의 구분자 · 안내 · 편향 문구 없음).
* `src/server/augment/index.test.ts`: `runAugment` 모드 분기(classic 은 기존 결과 그대로 · plan null, mode override, 실제 도메인 플래너 + 가짜 모델의 decompose, analyze 실패는 던짐, reevaluate 답변 재사용 조건), `planResult` 평탄화.
* `src/server/admin/plan/index.test.ts`: `GET/PUT /plan/config`(400 시 저장 안 함), `GET /plan/defaults` 모양, `POST /augment` 의 `mode` · `plan` 검증 400.
* `src/server/admin/runs/lifecycle/index.test.ts`: 가짜 pool 로 시험 실행(부분 trace 저장 · 최종이 부분을 덮지 않는 순서 · `createTraceSaver` 의 대기 중 push 병합과 쓰기 실패 무시, 스냅샷 `settings.plan`, `plan` 열 저장, `plan_progress` 기록, override 가 저장 설정을 바꾸지 않음, 재사용한 증강 후 답변, 플래너 실패는 error). 노드 기록(classic · 계획 실행의 `onNode` 조각이 `augment_run_nodes` 에 쓰이고 최종 답변이 `answer:before` · `after` 노드가 되며 노드 쓰기가 실행 종료 기록보다 먼저 끝나는 순서, 계획의 답 재사용 시 `answer:after` 가 없는 것)도 본다.
* `src/server/plan/calls/index.test.ts`: `recordModel`(순서 · 위임 · 실패 기록 · 6만 자 자르기와 원래 응답 보존 · 노드별 래퍼의 병렬 분리). `src/server/admin/runs/nodes/index.test.ts`: `createNodeSaver`(필드별 합침 · 대기 중 같은 키 병합 · 실패 무시), 키 검사, `GET /runs/:id/nodes/:key`(인코딩 · 404 · 400). `src/server/plan/ports/index.test.ts` 의 `onNode`: 포트별 키 규칙 · 실패 호출 기록 · build 의 호출 분리 · 사전 컨텍스트 길이. 마이그레이션 `008_run_nodes.sql` 은 일회용 DB 에 두 번 적용해 멱등 · 병합 upsert · cascade 삭제를 직접 확인했다(자동 테스트는 아님).
* `src/server/writer/index.test.ts`: 사전 컨텍스트가 없으면 프롬프트가 이전과 같고, 있으면 `{{provided}}` / 첫 `{{query}}` 뒤 / 끝에 들어가며 LLM 실패 대체 조립에도 남는다.
* `packages/dualcontext_domain/src/server/augment/index.test.ts`: 라우팅, 폴백, 프로시저 상위 개수, 쌍별 라이터 호출 수, 수집 실패 표시, 사전 컨텍스트(라이터에만 전달 · 빈 배열이면 기존 호출과 같음).
* `packages/dualcontext_domain/src/server/route/index.test.ts`: 코사인 상위 K, LLM 답 파싱.

* `src/server/mcp/tools/augment/index.test.ts`: MCP 도구 호출이 `source=mcp` 로 기록되고 최종 답변 모델 호출이 없음, 빈 컨텍스트, 실패는 오류 + `error` 행. `workbench/model/model.test.ts` 의 MCP 케이스: 최종 답변 노드를 그리지 않음.
* MCP 실행 로그 실측 계획 · 보고서: `tests/plans/mcp-run-log-20261118.md`, `tests/reports/mcp-run-log/20261118_165528.md`(스크립트 `test/20261118/`).

## 타입 검사

```sh
npm run lint --workspaces
```

## 배포된 서비스

```sh
npm run deploy dualcontext
```

배포가 게시 포트와 `GET /health` 를 확인하고 리포트 블록을 낸다. 배포된 컨테이너가 테스트 대상이다.

## MCP stdio

배포 뒤 `docker exec -i` 로 `tools/list`, `tools/call` 을 실제로 보낸다. 도구가 `augment_context` 하나뿐인지 확인한다.
Git Bash 에서는 `MSYS_NO_PATHCONV=1` 을 붙여야 `/app/...` 경로가 변환되지 않는다.

## 답변 점검(질의 → 증강 컨텍스트)

사전 정의 데이터를 적재한 뒤 `POST /api/admin/augment` 로 분야별 질의를 보내, 올바른 조사원 · 프로시저가 선택되고
근거가 출처와 함께 나오는지 본다. 결과와 판정은 `test/` 의 날짜 폴더 리포트에 남긴다.

## 라우팅 판정 점검(조사원이 없다는 판정)

`test/20261113/` 의 스크립트 3개: `routing-calibration.mjs`(질의와 조사원 설명의 유사도 분포로 기준값 선정), `routing-heldout.mjs`(기준값을 정할 때 쓰지 않은 질의 24개를 MCP 로 확인, 라벨은 실행 전에 고정), `routing-llm-eval.mjs`(같은 질의를 LLM 라우팅으로).

## 크롤러 조사원(컨테이너 통합)

운영 중인 스택을 건드리지 않고 임시 프로젝트 이름으로 크롤러만 띄워 확인한다.

```sh
docker compose -p dualcrawltest build crawler
docker compose -p dualcrawltest up -d --no-deps crawler
# 임시 pgvector DB 에 004_crawler.sql 을 적용하고, 임베딩은 가짜 임베더로 대체한 통합 스크립트로
# collectCrawler 를 실행한다(실제 사이트 크롤 → 청크 → 저장 → 검색 → 캐시 재사용 → 낡은 캐시의 백그라운드 재크롤).
docker compose -p dualcrawltest down
```

가짜 임베더는 순위 로직과 캐시 동작만 확인한다. 실제 임베딩 모델 품질은 배포 환경(AI 서버 설정)에서 따로 본다.

## 브라우저

`headless-browser-test` 스킬로 배포된 URL 에서 왼쪽 메뉴 이동, 조사원 저장, 시험 실행을 검증한다. 로케이터는 `constraints.md` 의 것만 쓴다.
