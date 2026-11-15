# 코드베이스 조사원 실측 기록

배포하지 않았다(`npm run deploy` 미실행). 개발 호스트(Windows, git 2.45.1, Node 26.4)에서 `collectCodebase` 를 직접 호출해 실제 공개 레포를 클론 · 인덱싱 · 질의했다. 컨테이너 이미지(Linux, Debian git)는 빌드하지 않았으므로 **컨테이너 안 동작은 미검증**이다.

## 방법

`collectCodebase(dataDir, {source:"git", url, subPath?, topK:4}, query)` 를 임시 데이터 폴더로 두 번 호출(첫 호출 = 클론 + 인덱싱 + 질의, 둘째 = 캐시된 인덱스 질의). 출력은 스크립트 표준 출력에서 옮겼다.

## 결과

| 레포 | 질의 | 첫 호출 | 둘째 호출 | files / symbols / callEdges / importEdges / skipped |
| --- | --- | --- | --- | --- |
| expressjs/cors | how are cors headers configured and the origin checked | 1110ms | 2ms | 8 / 73 / 96 / 3 / 9 |
| pallets/flask, subPath `src/flask` | how does the request context get pushed and popped | 1603ms | 2ms | 25 / 479 / 404 / 87 / 1 |

* cors 상위 자료: `lib/index.js:159-190 function cors`(`calls:` configureOrigin · configureCredentials · …, `called by:` middlewareWrapper · optionsCallback · originCallback · 테스트 파일 심볼들).
* flask 상위 자료: `app.py app_context`, `ctx.py AppContext`, `ctx.py pop` … 구조 줄이 붙었다. `pop` 의 `calls: get (…)` 는 흔한 이름 `get` 이 여러 파일의 다른 `get` 으로 이어진 **오탐**이다(이름 일치 호출 관계의 한계).
* 두 호출 뒤 데이터 폴더에는 인덱스 키 폴더 하나만 남았다(`*.work-*` 작업 폴더는 지워짐). 인덱스 JSON 에 `x-access-token` 문자열은 없었다(토큰 미사용 실행이라 이 점검은 토큰 경로의 증거가 아니다).
* 시간은 한 번씩 잰 값이다(반복 · 분산 없음). 네트워크 상태에 좌우된다.

## 하지 않은 것

* 컨테이너 빌드 · 컨테이너 안 클론(이미지에 `git` 을 남기도록 Dockerfile 을 고쳤으나 빌드하지 않았다).
* 비공개 레포(토큰) 클론. 클론 인자에 토큰이 argv 로 가지 않고 환경으로만 간다는 것은 단위 테스트로만 확인했다.
* 대형 레포, 상한(시간 · 크기) 초과 동작의 실측.
* 질의 적중 품질 평가(정답 라벨이 있는 질의 집합), codebase-memory-mcp 와의 직접 비교.
* 관리자 화면 브라우저 검증(타입 검사 · i18n 검사만 통과).
