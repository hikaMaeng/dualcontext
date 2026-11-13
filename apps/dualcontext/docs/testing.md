# 테스트

## 단위

```sh
npm run test --workspaces
```

* `apps/dualcontext/src/server/app.test.ts`: 헬스(DB 정상 · 장애 503).
* `packages/dualcontext_domain/src/server/augment/index.test.ts`: 라우팅, 폴백, 프로시저 없음, 연구원 없음.

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

배포 뒤 컨테이너 안에서 `tools/list` 와 `tools/call` 을 실제로 보낸다(`usage.md` 의 명령). 도구가 `augment_context` 하나뿐인지 확인한다.

## 브라우저

`headless-browser-test` 스킬로 배포된 URL 에 대해 연구원 → 프로시저 → 자료 등록 → 시험 실행 흐름을 검증한다. 로케이터는 `constraints.md` 의 것만 쓴다.
