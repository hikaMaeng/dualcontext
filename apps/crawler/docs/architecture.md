# 아키텍처

이 모듈에는 `src/` 가 없다. 경로 계약은 다음과 같다.

| 경로 | 계약 | 드릴다운 |
| --- | --- | --- |
| `docker/Dockerfile` | `FROM unclecode/crawl4ai:0.9.5`, `USER appuser`, `HEALTHCHECK`(`/health`). 프로젝트 빌드 없음. | `docker/Dockerfile` |
| `docker/env.defaults` | `CRAWL4AI_API_TOKEN`(비밀 아님), 광고 배너 끄기. 배포가 `docker/.env` 로 복사한다(커밋하지 않음). | `docker/env.defaults` |
| 루트 `docker-compose.yml` 의 `crawler` 서비스 | 프로젝트 네트워크 `dualcontext_internal`, 볼륨 없음, `shm_size: 1gb`, `mem_limit: 3g`, 호스트 포트 `127.0.0.1:${CRAWLER_HOST_PORT:-18082}`. | `docker-compose.yml` |

컨테이너 안에서는 supervisord 가 gunicorn(FastAPI)과 Redis(내부용)를 띄운다. 토큰이 없으면 서버가 컨테이너 루프백에만 바인딩해 밖에서 닿지 않으므로 토큰은 필수다.
