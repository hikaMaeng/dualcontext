# 신규 조사원(크롤러·코드베이스) 병합·배포·측정 보고 (2026-11-15)

## 병합·배포
- 브랜치 `worktree-agent-a4165e2bed8e8599b`(코드베이스), `worktree-agent-aadaf2a2965165418`(크롤러)를 master 에 병합(커밋 ea1e269, fb6d8cb). 충돌은 `ResearcherType`·`collect/index.ts`·`admin/researchers/index.ts`·조사원 화면·docs 5개로, 양쪽 모두 살리는 방향으로 해소했다.
- 병합 후 `npm run lint` 통과, `npm test` 실패 0, 검사 4종 `violations=0`.
- `npm run deploy dualcontext`: `status=ok`, 헬스 200. `npm run deploy crawler`: `status=ok`, 헬스 200(Crawl4AI 0.9.5, 127.0.0.1:18082).
- 실서버에 조사원 2개 등록(`new-researchers-setup.mjs`): 「파이썬 공식 문서(크롤)」(docs.python.org 튜토리얼 3페이지), 「Flask 소스 코드」(pallets/flask, subPath src/flask).
- 크롤 실측: 3페이지, 92청크, 약 8초(상태 API 의 startedAt~finishedAt).

## 측정 1: 라우팅 (`new-researchers-routing-eval.mjs`, 결과 `new-researchers-routing-eval_result.txt`)
- 질의 24개(크롤 대상 6, 코드 대상 6, 해당 없음 12), 라벨은 직접 만들었다.
- 적중 24, 놓침 0, 오선택 0. 단, 파이썬 질의 2건에서 Flask 소스가 같이 선택됐다(해당 없음 라벨이 아니라 기대 목록 밖이라 오선택으로 세지 않음).

## 측정 2: 수집 품질 (`new-researchers-retrieval-eval.mjs`, 결과 `new-researchers-retrieval-eval_result.txt`)
- 전체 경로(`/augment`)로 12개 질의, 대상 조사원 자료에 기대 단서 문자열이 들어 있는지. 선택 12/12, 단서 12/12.
- 이 단서 검사는 느슨하다(제목·경로·본문 어디든 문자열이 있으면 통과). 정답 조각의 순위나 답변 개선은 재지 않았다.

## 발견한 문제와 처리
1. **밑줄 이름 토큰화 결함(코드베이스)**: `url_for` 같은 snake_case 이름이 조각(url, for)으로만 색인돼, 질의 `flask url_for`는 불용어 `for` 가 빠진 `flask url` 로 검색돼 정확한 함수가 안 나왔다(첫 측정 run 200: 단서 없음). `rank/tokenize.ts` 가 밑줄 이름 전체 토큰도 남기도록 고쳤고(테스트 추가), 재측정 run 208 에서 `helpers.py:200-208 function url_for` 가 자료에 들어왔다.
2. **조사원 미선택(크롤)**: 첫 측정에서 영문 중심 파이썬 질의 2건(run 194, 196)은 전역 임베딩 선택(topK 3, minScore 0.67, margin 0.05)이 「소프트웨어 개발 질의응답」 0.7476 만 골랐고 크롤 조사원은 0.692(격차 0.0556)로 탈락했다. 설명·키워드를 실제 크롤한 장(가상환경·예외·자료구조)에 맞게 구체화한 뒤 같은 질의가 선택돼 단서 있음(run 202, 204). 라벨 질의에 맞춘 조정일 수 있어 일반화는 검증하지 않았다.
3. 지연: run 206 은 618.8초 걸렸으나 그중 「before」 답변 생성(컨텍스트 없는 LLM 호출)이 612.1초였다. 수집이 아니라 LLM 응답 시간이다.

## 한계
- 크롤러가 dualcontext 와 같은 네트워크에 있어 신뢰할 수 없는 사이트 크롤에는 네트워크 분리가 필요하다(미구현).
- 비공개 레포 토큰 경로는 단위 테스트만. 크롤러·코드베이스 조사원에는 연결된 프로시저가 없다.
- 한글만 있는 질의는 코드베이스 검색에서 결과가 없다(영문 토큰만 사용).
- 브라우저 검증: 관리자 화면에서 타입 선택지 5종, 크롤러 폼(`crawler-fields`, `crawler-status`)과 코드베이스 폼(레포 URL·하위 경로 등)이 한국어로 렌더링되고 저장된 값이 채워지는 것을 확인했다. 시나리오 문서·스크린샷은 만들지 않았다.
