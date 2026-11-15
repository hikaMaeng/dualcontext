# 내부

* 선택 근거(Firecrawl · Scrapy · Crawlee · Playwright 와의 비교)는 `apps/dualcontext/docs/internals.md` 의 「크롤러 조사원 결정」.
* 별도 모듈로 둔 이유: compose 규칙이 컨테이너 하나를 `apps/<service>` 모듈 하나가 소유하게 하고, dualcontext 컨테이너는 「컨테이너 하나, 볼륨 하나」 규칙과 Node+PostgreSQL 이미지라 Chromium 을 넣을 수 없다.
* `package.json` 이 없는 외부 런타임 모듈이라 npm 워크스페이스에 들어가지 않고, 짝이 되는 `packages/*_domain` 도 요구받지 않는다.
* Dockerfile 에 `HEALTHCHECK` 를 다시 쓴 이유: 기본 이미지의 검사는 RAM 2GB 미만이면 실패하게 되어 있고 Redis 도 확인한다. 여기서는 서비스가 응답하는지만 본다.
* 이미지를 받아 직접 확인한 값: 압축 2.3GB(amd64), 풀면 5.73GB, 기본 사용자 `appuser`, 토큰 없이는 컨테이너 루프백에만 바인딩.
