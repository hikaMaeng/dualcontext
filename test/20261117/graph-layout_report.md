# 실행 로그 그래프 배치 검증 (2026-11-17)

대상: 실행 #263(decompose, "How do I fix a git merge conflict ..."), 배포본 `http://127.0.0.1:18081`.

## 기준(사용자 요구)
분류 그래프의 맨 위는 질의 분해가 낳은 1차 아이템, 그 아래는 1차 아이템이 의존하는 아이템. 최종 답변은 1차 아이템의 컨텍스트로 증강된다.

## 결과
* 단위: `npm run test` 중 workbench 41건 통과(layout 3건 신규: arrangeEdges · feedPaths, model 기대값 갱신).
* 간선(브라우저, `run-canvas-edge`): derive `analyze>i1`, `analyze>i2`(1차 아이템만) · needs 는 의존하는 쪽 → 사전(`i1>i3`, `i3>i7` …) · feed 는 `group-1>answer:after` 한 줄. 총 15개.
* 화면: 1차 아이템 2개가 틀 맨 위, 사전 아이템이 아래 층, 최종 답변은 틀 아래에서 조립선으로 연결(스크린샷 육안 확인).
* 실제 동작(API `GET /api/admin/runs/263`): `context` 17759자 == top 아이템 2개(`Git merge conflict resolution`, `Git merge vs rebase`)를 `assembleContext` 규칙(`## 이름` + 컨텍스트)으로 이은 문자열과 완전 일치. 최종 답변 노드(`answer:after`)의 프롬프트 18130자에 그 컨텍스트 전체와 두 아이템 컨텍스트가 각각 포함됨. 사전 아이템은 별도 섹션으로 실리지 않고 의존하는 아이템 컨텍스트에 녹아 있다.
* 기각된 가설: "최종 답변이 사전 아이템 컨텍스트를 직접 받는다" — 조립 결과에 사전 아이템 섹션이 없어 아니다.
* 기존 위반(내 변경과 무관, stash 상태에서도 동일): `check-i18n` raw-key-lookup 2건(`server/plan/ports/index.test.ts`).
