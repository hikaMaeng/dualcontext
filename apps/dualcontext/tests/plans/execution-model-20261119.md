# Test Plan: execution-model
## Created
2026-11-19
## Goal
`docs/execution-design.md`(v5)의 실행 모델(큐와 소비자 · 취소 · CPU 격리 · MCP 중계)이 구현되어 배포된 컨테이너에서 동작하는지, 그리고 **추론 병렬성과 유효 처리량이 줄지 않았는지** 확인한다. 수용 기준(설계 문서 「최상위 제약」, 사용자 지시 원문 「그 안에서도 당연히 목표는 성능을 높이는 것이다. 인퍼런스의 병렬성을 희생해서는 안된다」):
1. 추론 서버로 나가는 동시 요청 수를 설계가 임의로 낮추지 않는다.
2. 대기 중인 작업이 있는데 소비자가 노는 일이 없다.
3. 이벤트 루프가 막혀 LLM 호출 발행이 늦어지는 일이 없다.
4. 취소 · 시한은 낭비 작업을 없애는 용도이며 정상 작업을 느리게 하지 않는다.
## Environment
배포된 컨테이너 `dualcontext`(`npm run deploy dualcontext`), 관리자 `http://127.0.0.1:18081`, 내부 listener `127.0.0.1:18082`(컨테이너 안, 게시하지 않음), 실제 AI 서버(`127.0.0.1:18180` 채팅 · 임베딩), 저장 계획 모드 classic. 브라우저: Playwright(전역 `HEADLESS_BROWSER_PLAYWRIGHT_ROOT`).
## Preconditions
컨테이너 healthy(`/health` 200), AI 서버 응답. 코드베이스 스레드 확인은 컨테이너가 공개 GitHub 에 닿아야 한다.
## Steps
1. 단위 · 규약: `npm run lint`, `npm test -w dualcontext`(큐 · 모델 게이트웨이 · 스트림 가드 · 실행 컨텍스트 · 라이프사이클 · 허브 · 내부 listener · transport 어댑터 · 수집기 · 워커), 규약 검사 4개(architecture · compose · docs · i18n).
2. `node test/20261119/mcp-verify.mjs`: 컨테이너 안 stdio MCP 서버(서버로 중계)에 실제 클라이언트로 붙어 light 호출과 진행 알림, middle 도중 요청 취소(취소 알림), middle 도중 stdio 종료(EOF), 상태 API 계측을 확인한다.
3. `node test/20261119/codebase-worker-check.mjs`: 공개 레포로 코드베이스 조사원을 임시 생성해 git 클론 → `cpu.build` 스레드 색인 → `cpu.search` 스레드 검색이 배포된 `dist` 에서 도는지, 그동안 이벤트 루프 지연을 본다. 끝나면 조사원을 지운다.
4. `node --import tsx test/20261119/parallelism-bench.mjs`: 같은 가짜 추론 서버에 대해 옛 방식(커밋 8ace667: 프로세스별 제한기 3 + 재시도 4 × 4)과 새 큐 방식을 비교한다(동시 요청 최댓값 · 완료 시간 · 총 HTTP 요청 수 · 이벤트 루프 p99).
5. `node test/20261119/plan-run.mjs reevaluate 3`: 계획 모드(reevaluate)를 한도를 줄여 끝까지 돌리며 5초마다 큐 계측(`inFlight` · `queued` · `maxInFlight`)과 이벤트 루프 지연을 표본으로 남긴다.
6. `node test/20261119/sse-live-check.mjs`: 진행 중인 실행 상세를 헤드리스 브라우저로 열어 SSE 로 갱신이 오는지(상세 폴링 없음), 취소가 화면에 반영되는지 본다.
7. `node test/20261118/run-log-badge-check.mjs <mcp id> <test id>`: 목록 · 뷰의 MCP 뱃지 · effort 문구와 콘솔 오류 · 4xx/5xx 응답.
## Expected Results
* 단위 시험 실패 0, 규약 검사 위반 0.
* 중계 호출이 정상 응답(머리 `effort=light coverage=ok`)과 단조 증가 진행 알림을 돌려주고 실행 로그에 `source=mcp` 로 남는다.
* 요청 취소 알림 · stdio 종료 뒤 실행이 `status=error`, `error=취소됨(cancelled)` 로 닫히고 큐의 `inFlight` 가 0, `activeRuns` 가 0 으로 돌아온다.
* 코드베이스 호출이 성공하고(`coverage=ok`, 그 조사원 섹션이 컨텍스트에 있음) 이벤트 루프 지연 p99 가 수십 ms 를 넘지 않는다.
* 대조 측정에서 새 방식의 서버 동시 요청 최댓값이 옛 방식 이상이고, 정상 부하의 완료 시간이 늘지 않으며, 장애(계속 503)에서 호출당 HTTP 요청 수가 줄어든다.
* 계획 모드 실행이 끝까지 돌고(`status=ok`) `maxInFlight` 가 1 을 넘는 구간(병렬 웨이브)이 관찰된다.
* SSE 화면: 이벤트 스트림 하나로 받고 상세 폴링 요청이 없으며, 실행 종료 · 취소가 화면에 반영된다.
## Logs To Capture
각 스크립트의 `test/20261119/verify/*_result.json`(상태 API 표본 포함), 컨테이너 stderr(`dualcontext mcp stdio ready`, `closed N interrupted run(s)`).
## Locator Contract
목록 `data-testid="run-item"`(`data-run-id`), 뱃지 `"run-item-source"`, 뷰 제목 `#run-heading`, 뷰 뱃지 `"run-source"`, effort 문구 `"run-item-effort"` · `"run-effort"`, 질의 `"run-query"`.
