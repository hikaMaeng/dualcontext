# 테스트

## 단위

```sh
npm run test --workspaces
```

* `src/server/app.test.ts`: 헬스(DB 정상 · 장애 503).
* `src/server/collect/collect.test.ts`: 폴더 경로 검증, MRL 축소, 식별자 검증.
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

## 브라우저

`headless-browser-test` 스킬로 배포된 URL 에서 왼쪽 메뉴 이동, 조사원 저장, 시험 실행을 검증한다. 로케이터는 `constraints.md` 의 것만 쓴다.
