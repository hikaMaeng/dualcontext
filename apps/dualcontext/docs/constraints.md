# 제약

## 파급 범위

| 표면 | 소비자 | 깨면 안 되는 불변식 |
| --- | --- | --- |
| MCP 도구 `augment_context` | 외부 MCP 클라이언트 | 도구는 하나, 인자는 `query` 하나. 도구나 인자를 늘리면 모든 클라이언트 계약이 바뀐다. |
| `GET /health` | 배포 검증, 컨테이너 `HEALTHCHECK`, 브라우저 스모크 | 인증 없음. DB 가 안 되면 `503`(컨테이너를 unhealthy 로 만든다). 경로를 바꾸면 배포 리포트와 이미지 헬스가 같이 깨진다. |
| `readEnv` | 프로세스 시작 | 범위 밖 `PORT`, 모르는 `NODE_ENV`, `postgresql://` 이 아닌 DB URL 은 기본값으로 덮지 않고 던진다. |
| stdio 모드 stdout | MCP 클라이언트 | stdout 은 프로토콜 전용. 로그를 `console.log` 로 찍지 않는다. |

## 컨테이너

* **컨테이너 하나, 볼륨 하나.** 둘을 늘리지 않는다. 영속 대상은 볼륨 하위 폴더로 나눈다.
* PostgreSQL 은 `127.0.0.1` 에서만 듣고 게시하지 않는다. `trust` 인증은 이 전제에서만 안전하다. 리슨 주소를 넓히려면 먼저 인증을 바꾼다.
* 관리자 사이트에 인증이 없으므로 compose 는 호스트 포트를 `127.0.0.1` 로만 연다. 외부에 열려면 인증을 먼저 추가한다.
* 볼륨의 `pgdata` 는 PostgreSQL 17 메이저에 묶인다. 메이저를 올리려면 덤프/복원이 필요하다.
* Dockerfile 은 프로젝트를 빌드하지 않는다. 컴파일하는 것은 이미지 소유 도구(mecab-ko, textsearch_ko)뿐이다.
* mecab-ko 는 bitbucket 에서, textsearch_ko 는 GitHub 기본 브랜치에서 받는다(고정되지 않음). 재현성이 필요하면 버전을 고정한다.

## 프런트

UI 는 shadcn/ui 스타일 컴포넌트, Tailwind, Radix 를 쓴다(셀렉트는 네이티브 `<select>` 를 같은 스타일로 감쌌다).
화면 문자열은 전부 리소스 키이며 8개 언어 번들이 같은 키 집합을 가진다.

허용 로케이터:

| 로케이터 | 요소 |
| --- | --- |
| `role=main`, `role=heading` level 1 | 본문, 페이지 제목 |
| `role=status`, `data-testid="service-state"` | 런타임 상태 줄 |
| `role=tablist` / `role=tab` | 관리 영역 전환 |
| `data-testid="researcher-item"`, `"procedure-item"`, `"document-item"` | 목록 항목 |
| `data-testid="routing-state"`, `"augmented-context"` | 시험 실행 결과 |
