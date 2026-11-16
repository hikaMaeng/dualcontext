# 실행 로그 목록/뷰 분리 검증 (2026-11-16, 배포된 서버 127.0.0.1:18081)

## 자동
- `npm test`: dualcontext tests 119, pass 112, fail 0(7건은 DB 필요로 건너뜀), dualcontext_domain tests 32, pass 32, fail 0.
- 검사 4종(arch · compose · docs · i18n): 모두 violations=0. `npm run deploy dualcontext`: status=ok, health 200.

## API (라이브)
- `GET /runs?pageSize=2` → `{items, total, page, pageSize}`, 항목에 `researchers`, `procedures` 포함. `GET /runs/filters` 정상.
- 키워드 `q=얕은 클론` → total 1 (run 215, 점수 0.99).
- 필터 OR: `researcher=코드: p4`, `researcher=코드: ytkit` → total 2, 서로 다른 두 실행.
- 의미 검색(최소 유사도 0.8): `cloneShallow 함수는 어디에 있어` → 215 (0.91), `얕은 클론을 수행하는 함수` → 215 (0.86), `flask 라우트 등록` → 8건(0.84~0.87). **`깃 저장소를 얕게 복제하는 코드`는 0건** — 의역 질의는 0.8 문턱에서 빠진다.

## 화면(헤드리스 브라우저, 실제 조작)
- 목록: 20건/쪽, 전체 164건, 1/9쪽, 2줄 항목, 조사원 줄 `text-overflow: ellipsis`.
- 검색 `얕은 클론` → 1건. 항목 클릭 → `#runs/215` 뷰: 질의 전체, 한 줄 요약(시각 · 상태 · 소요), 탭 답변 · 라우팅 · 조사원 · 컨텍스트 모두 선택·내용 표시. 「목록으로」 후 검색어와 결과 유지.
- 조사원 필터 2개 선택 → 칩 2개, 검색어를 비우면 2건(OR). 검색어가 있는 채로 필터를 걸면 AND 라 0건.

## 한계
- 의미 검색 문턱 0.8 은 표본 2행 × 5질의로 정한 값이다.
- 진행 중 실행의 SSE 실시간 갱신은 이 검증에서 보지 않았다.
- 존재하지 않는 `#runs/<id>` 는 「불러오는 중」이 계속 보인다(기존 `useRun` 동작).
