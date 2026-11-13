# 제약

## 파급 범위

| 표면 | 소비자 | 깨면 안 되는 불변식 |
| --- | --- | --- |
| MCP 도구 `augment_context` | 외부 MCP 클라이언트 | 도구는 하나, 인자는 `query` 하나. 늘리면 모든 클라이언트 계약이 바뀐다. |
| `GET /health` | 배포 검증, 컨테이너 `HEALTHCHECK`, 브라우저 스모크 | 인증 없음. DB 가 안 되면 `503`. 경로를 바꾸면 배포 리포트와 이미지 헬스가 같이 깨진다. |
| `readEnv` | 프로세스 시작 | 범위 밖 값은 기본값으로 덮지 않고 던진다. |
| stdio 모드 stdout | MCP 클라이언트 | stdout 은 프로토콜 전용. 로그는 stderr. |
| `ds_*` 테이블 벡터 | pgvector 조사원 | `embedding`(768) 은 설정된 임베딩 모델의 출력이고, `embedding_mrl`(256) 은 그 앞 256개를 재정규화한 값이다. 모델이나 차원을 바꾸면 전부 다시 임베딩해야 한다. |
| `augment_runs` 로그 | 관리자 「실행 로그」 화면 | **시험 실행만** 기록한다(MCP 호출은 기록하지 않는다). 키 `id`, 범위 전체, 상한 최근 500건(새 로그를 쓸 때 오래된 것을 지운다), 지우는 쪽 서버 · 관리자(개별 삭제). `settings` 스냅샷에는 API 키를 넣지 않는다. 질의 원문과 수집된 자료가 평문으로 남는다. |
| 조사원 임베딩 캐시 | 라우터(임베딩) | `embedding_key` = 모델 이름 + 글의 해시. 글이나 모델이 바뀌면 키가 달라져 다시 계산한다. |

## 컨테이너

* **컨테이너 하나, 볼륨 하나.** 둘을 늘리지 않는다. 영속 대상은 볼륨 하위 폴더로 나눈다. 볼륨 마운트 경로는 베이스 이미지의 `VOLUME` 과 같아야 익명 볼륨이 생기지 않는다.
* PostgreSQL 은 `127.0.0.1` 에서만 듣고 게시하지 않는다. `trust` 인증은 이 전제에서만 안전하다.
* 관리자 사이트에 인증이 없으므로 compose 는 호스트 포트를 `127.0.0.1` 로만 연다. 외부에 열려면 인증을 먼저 추가한다.
* 볼륨의 `pgdata` 는 PostgreSQL 17 메이저에 묶인다.
* Dockerfile 은 프로젝트를 빌드하지 않는다. 컴파일하는 것은 이미지 소유 도구(mecab-ko, textsearch_ko)뿐이다. 두 도구는 고정되지 않은 위치(bitbucket, GitHub 기본 브랜치)에서 받는다.

## 보안

* **API 키는 쓰기 전용**이다. 조회 API 는 `hasApiKey` 만 돌려준다. 다만 DB(볼륨)에 평문으로 저장된다. 볼륨 접근 권한이 곧 키 접근 권한이다.
* 관리자가 입력하는 테이블 · 컬럼 이름은 SQL 에 직접 들어가므로 식별자 형태(`^[a-z_][a-z0-9_]*$`)만 허용하고 큰따옴표로 감싼다. 값은 모두 바인딩한다.
* 폴더 조사원은 볼륨 밖 경로와 `pgdata` 를 거부한다(`..` · 절대 경로 포함).

## 되돌림은 조용하지 않다

라우팅 방법(임베딩 · LLM)이 실패하면 키워드 일치로 되돌아간다. 되돌림은 결과의 `researcherRouting` · `procedureRouting` 에
`embedding-failed(이유)->keyword...` 형태로 남고 시험 실행 화면에 보인다. LLM 라이터가 실패하면 컨텍스트 맨 앞에 실패 사실을 적고 기본 조립으로 대체한다.
조사원 수집이 실패하면 그 이유가 컨텍스트의 「부족한 항목」에 들어간다.

## 프런트

UI 는 shadcn/ui 스타일 컴포넌트, Tailwind, Radix 를 쓴다(셀렉트는 네이티브 `<select>` 를 같은 스타일로 감쌌다).
화면 문자열은 전부 리소스 키이며 8개 언어 번들이 같은 키 집합을 가진다. 테마는 `styles.css` 의 `@theme` 토큰이다.

허용 로케이터:

| 로케이터 | 요소 |
| --- | --- |
| `nav[aria-label]` 안의 버튼, `aria-current="page"` | 왼쪽 메뉴와 현재 화면 |
| `role=main`, `role=heading` level 1 (`#page-title`) | 본문, 화면 제목 |
| `role=status`, `data-testid="service-state"` | 런타임 상태 줄 |
| `data-testid="researcher-item"`, `"procedure-item"`, `"writer-item"` | 목록 항목 |
| `data-testid="routing-state"`, `"logged-state"`, `"pair-item"`, `"augmented-context"` | 시험 실행 결과와 로그 링크 |
| `data-testid="run-item"` | 실행 로그 목록 항목 |
| `data-testid="run-detail"`, `"run-routing"`, `"run-settings"`, `"run-pair"`, `"run-context"` | 실행 로그 상세 |
| `data-testid="researcher-method"`, `"procedure-method"` | 라우터 방법 선택 |
| `data-testid="embedding-url"`, `"embedding-model"`, `"chat-url"`, `"chat-model"` | AI 서버 입력 |
