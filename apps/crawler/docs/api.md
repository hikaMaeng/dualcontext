# API

Crawl4AI 0.9.5 의 REST API. dualcontext 가 쓰는 것만 적는다(전체는 컨테이너의 `/openapi.json`).

| 경로 | 인증 | 용도 |
| --- | --- | --- |
| `GET /health` | 없음 | `{ status:"ok", version }`. 컨테이너 `HEALTHCHECK` 와 배포 검증. |
| `POST /crawl` | `Authorization: Bearer <CRAWL4AI_API_TOKEN>` | 본문 `{ urls:[url], browser_config, crawler_config }` → `{ success, results:[{ success, status_code, redirected_url, markdown:{raw_markdown, fit_markdown}, links:{internal[]}, metadata:{title}, error_message }] }`. |

dualcontext 의 요청 본문은 `apps/dualcontext/src/server/collect/crawler/client` 의 `crawlRequest` 가 만든다: `cache_mode: bypass`, `nav/footer/header/aside/form` 제외, 가지치기 필터(`fit_markdown`), 링크 · 이미지를 글에서 제외, 브라우저 User-Agent 는 `Mozilla/5.0 (compatible; dualcontext-crawler/1.0)`.

내부 주소(`169.254.169.254`, `127.0.0.1` 등)를 요청하면 `{"detail":"URL blocked (SSRF protection): URL blocked"}` 로 거부한다(직접 호출로 확인).
