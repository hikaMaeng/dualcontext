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
* `packages/dualcontext_domain/src/server/augment/index.test.ts`: 라우팅, 폴백, 프로시저 상위 개수, 쌍별 라이터 호출 수, 수집 실패 표시.
* `packages/dualcontext_domain/src/server/route/index.test.ts`: 코사인 상위 K, LLM 답 파싱.

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
CRAWLER_HOST_PORT=18992 docker compose -p dualcrawltest build crawler
CRAWLER_HOST_PORT=18992 docker compose -p dualcrawltest up -d --no-deps crawler
# 임시 pgvector DB 에 004_crawler.sql 을 적용하고, 임베딩은 가짜 임베더로 대체한 통합 스크립트로
# collectCrawler 를 실행한다(실제 사이트 크롤 → 청크 → 저장 → 검색 → 캐시 재사용 → 낡은 캐시의 백그라운드 재크롤).
docker compose -p dualcrawltest down
```

가짜 임베더는 순위 로직과 캐시 동작만 확인한다. 실제 임베딩 모델 품질은 배포 환경(AI 서버 설정)에서 따로 본다.

## 브라우저

`headless-browser-test` 스킬로 배포된 URL 에서 왼쪽 메뉴 이동, 조사원 저장, 시험 실행을 검증한다. 로케이터는 `constraints.md` 의 것만 쓴다.
