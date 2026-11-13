# 아키텍처

| 경로 | 계약 | 드릴다운 |
| --- | --- | --- |
| `src/server/index.ts` | 진입. `--stdio` 면 MCP stdio, 아니면 HTTP(헬스 + 관리자 + 프런트). | `src/server/index.ts` |
| `src/server/app.ts` | Express 앱. `/health`, `/api/admin`, 정적 서빙. | `createApp` |
| `src/server/mcp` | MCP 서버. 도구 `augment_context` 하나. | `mcp/tools/augment` |
| `src/server/augment` | 도메인 `augmentQuery` 에 저장소 포트를 채워 주는 한 곳. MCP 와 시험 실행이 공유. | `augment/index.ts` |
| `src/server/admin` | 관리 API. 엔티티별 폴더(`researchers`, `procedures`, `documents`). | `admin/index.ts` |
| `src/server/db` | 커넥션 풀과 상태 조회(pgvector · 한국어 검색 확인). | `db/index.ts` |
| `src/front` | Vite React 관리자. 기능별 폴더(`features/*`)와 폴더별 `resource.ts`. | `main.tsx` |
| `docker/` | 이미지, 엔트리포인트, DB 초기화 SQL. | `docker/Dockerfile` |

## 컨테이너 하나, 프로세스 둘

`docker/entrypoint.sh` 가 한 컨테이너 안에서 PostgreSQL(pgvector + mecab-ko 한국어 전문 검색)을
먼저 띄우고 준비되면 Node 를 띄운다. 어느 쪽이든 종료하면 다른 쪽도 내리고 컨테이너가 종료한다.
둘 다 비루트 `postgres` 사용자로 돈다.

## 볼륨 하나

이름 있는 볼륨 `dualcontext_data` 하나를 `/var/lib/postgresql/data` 에 마운트하고, 영속 대상은 하위 폴더로 나눈다.
현재는 `pgdata/` 뿐이다. 새 영속 대상이 생겨도 볼륨을 늘리지 않고 `<대상>/` 을 만든다.
