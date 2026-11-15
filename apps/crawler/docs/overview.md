# 개요

* 하는 일: URL 하나를 받아 Chromium 으로 렌더링하고 마크다운 · 링크 · 제목을 돌려준다(Crawl4AI REST `POST /crawl`).
* 하지 않는 일: 어디를 크롤할지 정하지 않는다. 깊이 · 도메인 · robots.txt · 요청 간격 · 상한 · 캐시는 모두 `apps/dualcontext` 의 `collect/crawler` 가 맡는다. 이 컨테이너는 상태가 없다.
* 호출자는 `dualcontext` 컨테이너 하나다(프로젝트 네트워크 `http://crawler:11235`).
* 이미지: `unclecode/crawl4ai:0.9.5`(Apache-2.0)에 비루트 `USER` 와 `HEALTHCHECK` 만 더했다.
