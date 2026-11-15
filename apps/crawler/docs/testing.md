# 테스트

* 정적: `bash .codex/skills/docker-compose-module-design/scripts/check-compose.sh`.
* 단독 기동(운영 스택과 분리):

```sh
CRAWLER_HOST_PORT=18992 docker compose -p dualcrawltest up -d --build --no-deps crawler
curl -s http://127.0.0.1:18992/health
docker compose -p dualcrawltest down
```

* 컨테이너가 `healthy` 가 되는지, 사용자가 `appuser` 인지(`docker inspect crawler`), 토큰 없는 `/crawl` 이 거부되는지, 내부 주소가 거부되는지 본다.
* 크롤러 조사원 전체 경로(크롤 → 청크 → 저장 → 검색)는 `apps/dualcontext/docs/testing.md` 의 「크롤러 조사원(컨테이너 통합)」.
