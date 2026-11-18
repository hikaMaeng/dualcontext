# Test Plan: mcp-run-log
## Created
2026-11-18
## Goal
MCP 도구 `augment_context` 호출이 관리자 「실행 로그」에 시험 실행과 같은 목록으로, 출처 `mcp` 와 `MCP` 뱃지만 달라진 채 남는지 확인한다. MCP 호출은 컨텍스트만 돌려주고 최종 답변(증강 전 · 후)을 만들지 않는다.
## Environment
배포된 컨테이너 `dualcontext`(`npm run deploy dualcontext`), 관리자 `http://127.0.0.1:18081`, 저장 계획 모드 classic, 실제 AI 서버. 브라우저: `.codex/skills/headless-browser-test` 러너와 Playwright(전역 `HEADLESS_BROWSER_PLAYWRIGHT_ROOT`).
## Preconditions
컨테이너 healthy(`/health` 200). 시험 실행 로그가 하나 이상 있다(여기서는 #287, 옛 행이라 `source=test`).
## Steps
1. `node test/20261118/mcp-run-log.mjs "<질의>"`: 컨테이너 안 stdio MCP 서버에 실제 클라이언트로 붙어 `tools/list` · `augment_context` 호출, 호출 전후 `GET /api/admin/runs` 로 새 행을 찾아 `GET /api/admin/runs/:id` 와 비교한다.
2. `node test/20261118/mcp-abandon.mjs`: 호출 도중 클라이언트를 닫고 그 실행이 어떻게 끝나는지 본다.
3. `node test/20261118/run-log-badge-check.mjs <mcp id> <test id>`: 목록 · 뷰에서 뱃지 유무와 그래프의 증강 전 답변 노드 유무, 콘솔 오류 · 4xx/5xx 응답을 본다.
4. `run-headless-browser-test.mjs --spec test/20261118/scenario-run-log-badge.json`: 목록 → MCP 실행 뷰 시나리오와 스크린샷.
## Expected Results
* 새 행 정확히 1개, `source=mcp`, `status=ok`, `stage=done`, `answers` 비어 있음, 저장된 `context` 가 MCP 응답 텍스트와 같다.
* 연결을 끊어도 행이 `running` 으로 영구히 남지 않는다.
* 목록 항목과 뷰 제목에 `MCP` 뱃지가 MCP 실행에만 있고 시험 실행(#287)에는 없다. MCP 실행 그래프에 「증강 전 답변」 노드가 없고 시험 실행에는 있다. 콘솔 오류 · 4xx/5xx 응답이 없다.
## Logs To Capture
각 스크립트의 `*_result.json`, 헤드리스 러너 `report.md`/`report.json`/스크린샷, 컨테이너 stderr(`dualcontext mcp stdio ready`).
## Locator Contract
목록 `data-testid="run-item"`(`data-run-id`), 뱃지 `"run-item-source"`(`data-source="mcp"`, MCP 항목에만), 뷰 제목 `#run-heading`, 뷰 뱃지 `"run-source"`(같은 조건), 질의 `"run-query"`. 시나리오 러너는 role(`list`)과 text 만 쓴다.
