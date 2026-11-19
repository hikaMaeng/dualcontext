# Test Plan: collect-queues
## Goal
조사원 수집이 종류별 작업 큐(`web` · `store` · `crawl` · `codebase`)를 거치고, 동시 처리 수가 종류별 소비자 수를 넘지 않는지, 그리고 질의분해(`decompose`)가 호스트를 얼마나 쓰는지 관측한다.
## Acceptance
* 종류별 큐는 모든 작업을 받고 동시에 도는 수의 최댓값이 그 종류의 소비자 수와 같다(`collect/queues/index.test.ts`).
* 한 종류가 막혀도 다른 종류는 진행한다. 취소하면 큐에서 빠지고 실행 중이면 작업 신호가 abort 된다. 닫힌 큐는 `shutdown` 으로 거절한다.
* `collect(…, { queues })` 가 조사원 타입에 맞는 큐로 보낸다.
* 배포 뒤 `/api/admin/status` 의 `collect` 가 네 종류와 소비자 수(2 · 6 · 2 · 2)를 보여 준다.
* 관측: 저장된 한도 그대로 질의분해를 돌릴 때 호스트 · 컨테이너 · 큐 지표를 2초 간격으로 디스크에 남긴다(`test/20261119/host-monitor.ps1`). 임계치(CPU 85% · 여유 메모리 25GB 미만 · 디스크 큐 10 이상이 3회 연속, 또는 기록 루프 12초 정지)를 넘으면 실행을 자동 취소한다.
## Procedure
1. `npm test -w dualcontext`, `npm run lint -w dualcontext`, 규약 검사 4개.
2. `host-monitor.ps1 -OutFile test/20261119/verify/host-monitor_decompose.jsonl` 을 띄우고 `node test/20261119/decompose-run.mjs 40`.
3. 실행이 끝나면 기록기를 멈춘다(`<OutFile>.stop`). `npm run deploy dualcontext` 뒤 상태 API 를 읽는다.
## Not covered
* 새 큐 구조로 같은 질의분해를 다시 돌려 옛 구조와 비교하는 것(배포 뒤 실행하지 않았다).
* 코드베이스 · 크롤러 조사원이 선택되는 질의와 재평가 모드의 호스트 부하.
