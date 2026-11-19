# 코덱스 리뷰 3회차(최종): dualcontext 실행 모델 설계 v4 검토 (설계 리뷰, 코드 수정 금지)

## 0. 맨 앞 지시: 실코드 병행 검증 (필수)
`apps/dualcontext/docs/execution-design.md`(v4)의 사실 주장과 **구현 가능성**을 이번 회차에 저장소 소스와 설치된 의존성(`node_modules`의 `@modelcontextprotocol/sdk` 1.32.2, `undici`, `pg`, `express`, `esbuild`)을 직접 열어 대조하라. 1 · 2회차(`test/20261119/codex-review-strategy/report.json`, `test/20261119/codex-review-round2/report.json`)의 판정을 재사용하지 마라. 각 주장에 정확/부정확/근거불일치를 붙이고, 지적마다 `파일:라인` 근거를 달아라. 가능하면 재현(메모리 전용 스크립트)으로 확인하라. 코드를 고치지 말고 지적만 하라.

## 1. 사용자 요구 (원문)
- "통합하여 최적 코드로 만들어야해. 동시성과 취소는 cpu블로킹과 밀접해."
- "그 안에서도 당연히 목표는 성능을 높이는 것이다. 인퍼런스의 병렬성을 희생해서는 안된다"
- "용량이 아니라 큐 개념이기 때문이다. 큐에 담고 워커가 가져가는 동시성인 셈이지. 따라서 큐에는 순차적으로 모든 요청을 담아도 무방하다. 부하는 워커만큼만 걸릴테니"
- "코덱스 리뷰를 받고 피드백하는 과정을 2번더 진행. 그 이후 묻지말고 구현" (이번이 마지막 리뷰. 이후 구현한다.)

## 2. 2회차의 "구현 전 반드시 고칠 항목 12개"와 v4 의 대응 — 해소 여부를 코드·문서로 판정
1. 6·16·크롤러 1 비열화 단정 → v4: 기본값 채팅 9/임베딩 32, 비열화는 측정으로 확인한다고 문서화, 크롤러는 소비자 4 이며 입증된 값이 아님을 명시.
2. `await run`, ready/지연 큐, 실행별 순환, aging → v4 「소비자 루프」「큐 구조」.
3. 취소·재시도·완료의 단일 settle, 분기 drain → v4 「작업 상태기계」「settleAll」.
4. 무제한 대기 payload 보관·해제, 캐시·허브 수명 → v4 「메모리」(참조, settle 시 해제, 스냅샷 50개/60초).
5. SQL 벡터 입력·차원·유효값·페이지별 순위 → v4 「크롤러 코사인은 DB 에서」의 materialized CTE 쿼리.
6. MCP ID 0 · EOF · `maxTotalTimeout` → v4 stdio 항목(transport.onmessage 래핑, stdin end, 한계 문서화).
7. 모델 외 취소 전달, 공유 작업 자체 신호·모델 설정 고정 → v4 「모델 밖의 취소 전달」「embedPending」.
8. DB 취소·연결 정리·5초 초과·종료 이후 쓰기 방지 → v4 「종료 순서」.
9. deadline 부분 결과 반환·저장·coverage → v4 「시한 만료의 반환 경로」.
10. CPU 소비자 배치·협력 취소·캐시 generation·바이트 예산 → v4 「스레드 소비자」(`cpu.search` 전용 스레드 + 공유 Int32Array 플래그 + stat 무효화 + resourceLimits).
11. 메인에 남는 파싱·직렬화 경계, 스트림 가드 범위 → v4 「스트림 가드」「메인에 남는 동기 후처리의 경계」.
12. robots/import/`extractJson` 의 실제 복잡도와 의미, patch·node 저장 완료·허브 종료 정합성 → v4 「CPU 작업」「상태 전달」.
추가로 2회차 새 발견 중 v4 에서 의도적으로 **범위에서 뺀 것**: 구성요소별 tsvector 열(측정 후 판단), DB 의 `statement_timeout` 30초(오래 걸릴 수 있는 쿼리만).

## 3. 이번에 특히 확인할 것 (우선순위)
A. **v4 가 새로 만든 결함**: 상태기계의 경쟁(취소 vs 지연 타이머 vs 완료), aging 의 정확성, 지연 큐 타이머 깨움 누락, 실행별 순환 목록의 기아·메모리, `settleAll` 과 기존 `Promise.all` 코드 변경 범위, 소비자가 `attempt` 정리를 기다리는 동안의 처리량 영향.
B. **구현 가능성 재현**: (1) materialized CTE + `array_length` 선필터 + `embedding::vector <=> $::text::vector` 쿼리가 pg 8.23.1 바인딩(`[a,b,c]` 문자열)과 pgvector 0.8.6 에서 문법·의미상 맞는가(영벡터 NaN, `1 - distance` 와 기존 JS `cosine` 의 일치, row_number 로 perPage 적용 순서). (2) stdio: `process.stdin.on("end")` 에서의 처리와 `transport.onmessage` 래핑으로 요청 ID 0 취소를 처리할 때 SDK 1.32.2 의 `server/stdio.js`/`shared/protocol.js` 에서 가능한 방법(래핑 가능 시점, `extra.signal` 연결). (3) `worker_threads` 의 공유 `Int32Array` 취소 플래그와 `resourceLimits`, esbuild `--outdir` 다중 엔트리와 서버 번들 `import.meta.url` 기준 워커 경로 산정이 현재 `createRequire` 배너 구성에서 동작하는가. (4) robots 탐욕 조각 배치가 글롭 존재 판정에서 정확한가(현재 `matches()`/`isAllowed()` 와 동치인지 반례).
C. **병렬성 위반 재탐색**: v4 의 소비자 수 기본값(9/32/8/4, cpu.build min(2,cpus-1)), `io.collect` 큐 도입(기존에는 조사원 수집이 제한 없이 병렬), `cpu.search` 전용 스레드 1개의 직렬성(여러 실행의 검색이 한 스레드에서 직렬화되는가?), 크롤러 소비자 4, 갱신 합치기·표본 trace 가 사용자 체감 병렬성을 줄이는가.
D. **현재 코드와의 충돌**: `augment/base`, `routing`, `writer`, `collect/*`, `plan/ports`, `plan/calls`, `admin/runs/*`, `mcp/*`, `index.ts`, 도메인 `plan/*` 에 v4 를 끼울 때 시그니처 변경 범위와 기존 시험 영향(변경해야 할 시험 목록).
E. **누락·과설계**: 구현 범위를 안전하게 줄일 수 있는 부분(예: 지금 빼도 되는 항목), 반대로 빠지면 안 되는 항목.

## 4. 출력 형식
먼저 2회차 필수 항목 12개의 해소 여부 표(해소/부분/미해소 + 근거). 그다음 새 발견: `파일:라인 / 무엇이 틀렸나 / 어떤 입력·상황에서 깨지나 / 심각도(P1 구현 전 필수·P2 구현 중 처리·P3 후속) / 병렬성 영향(있음·없음) / 수정 방향`. 마지막에 "묻지 않고 구현을 시작해도 되는가" 판정과, 구현 중 반드시 지켜야 할 항목 목록(구현 순서가 아니라 의존 관계 기준). 코드를 고치지 마라.
