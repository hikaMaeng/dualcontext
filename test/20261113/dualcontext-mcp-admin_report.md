# dualcontext MCP + 관리자 사이트 검증 기록

대상: `npm run deploy dualcontext` 로 배포된 컨테이너 `dualcontext` (호스트 `127.0.0.1:18081`).

## 계획(수락 기준)

| # | 기준 | 출처 |
| --- | --- | --- |
| 1 | MCP 는 함수 하나만 제공하고, 인자는 원래 질의만 받는다. | 사용자 지시 |
| 2 | 질의를 증강한 컨텍스트를 응답으로 준다. 내부는 연구원 다수 × 프로시저 다수 → 라이터. | 사용자 지시 |
| 3 | 동작은 stdio 가 기본이다. | 사용자 지시 |
| 4 | 컨테이너는 1개, 그 안에 Node 와 pgvector. 볼륨도 1개이며 하위 폴더로 나눈다. | 사용자 지시 |
| 5 | pgvector 쪽은 한국어를 지원한다. | 사용자 지시 |
| 6 | 운영용 관리자 웹사이트가 있다. | 사용자 지시 |

## 실행 결과

| # | 실행 | 관측 | 판정 |
| --- | --- | --- | --- |
| 1 | stdio 로 `tools/list` 전송 | `tools: [ 'augment_context' ]`, `required: ["query"]` | 통과 |
| 2 | stdio `tools/call augment_context {query:"반품 환불 가능한가요"}` | `# 증강 컨텍스트` … `연구원: 사내문서 / 프로시저: 규정 해석` … 근거 자료 `[출처: 환불 규정]` | 통과 |
| 3 | `docker exec -i dualcontext node /app/dist/server/index.js --stdio` | 위 1·2 가 이 경로로 응답 | 통과 |
| 4 | `docker ps`, `docker inspect` Mounts | 컨테이너 `dualcontext` 1개, 마운트 `volume dualcontext_dualcontext_data -> /var/lib/postgresql/data` 1개 | 통과 |
| 5 | `GET /api/admin/status` | `pgvector 0.8.6`, `textsearchKo 1.0`, `koreanConfig true`, 분석 예시 `'검색':3 '한국어':1 '형태소':2` | 통과 |
| 5 | `to_tsvector('korean','개봉한 상품도 환불할 수 있나요?')` | `'개봉':1 '상품':3 '수':6 '있':7 '환불':4` | 통과 |
| 6 | 브라우저: 시험 실행 탭에서 질의 실행 | h1 `dualcontext 관리자`, `service-state` 에 한국어 분석 예시, `routing-state` `키워드가 맞는 연구원을 선택했습니다.`, 컨텍스트에 `규정 해석` 절차 출력 | 통과 |
| 7 | 재배포 후 `GET /api/admin/researchers` | 이전에 등록한 `사내문서` 유지 | 통과(볼륨 영속) |
| 8 | 배포 리포트 | `deploy-total status=ok`, `/health` 200 `database:"ok"` | 통과 |
| 9 | 단위 테스트 | app 4건, domain 4건 통과 | 통과 |
| 10 | `check-i18n`, `check-architecture`, `check-compose`, `check-docs` | 모두 violations=0 | 통과 |

## 반증된 가설과 중간 실패

* 가설 「베이스 이미지 + Node 바이너리 복사면 바로 돈다」는 틀렸다. `libatomic.so.1` 누락으로 컨테이너가 exit 127 재시작 루프에 빠졌다. `libatomic1` 설치로 해결.
* `to_regconfig` 는 PG17 에 없어 `/api/admin/status` 가 500 이었다. `pg_ts_config` 조회로 교체.
* 베이스 이미지의 `VOLUME` 때문에 익명 볼륨이 하나 더 생겨 마운트가 2개였다. 데이터 경로를 `/var/lib/postgresql/data` 로 옮겨 1개로 줄였다.

## 검증하지 못한 것

* 관리자 UI 의 연구원 · 프로시저 · 자료 **등록 폼** 은 브라우저로 누르지 않았다(등록은 REST 로 했다). 시험 실행 탭과 상태 줄만 브라우저로 확인했다.
* 8개 언어 중 ko 외의 화면은 렌더링 확인을 하지 않았다(키 집합 일치만 `check-i18n` 으로 확인).
* 라우팅 `fallback-all`, 프로시저 없음 경로는 단위 테스트로만 확인했고 배포본에서는 돌리지 않았다.
* 라이터가 LLM 이 아니라 결정적 조립이라 「임팩트 추출」 품질은 평가 대상이 아니다.
* 한국어 검색 품질(재현율)은 문서 1건으로만 확인했다.
