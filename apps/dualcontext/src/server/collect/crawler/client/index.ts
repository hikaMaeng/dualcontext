import { raceAbort } from "../../abort/index.js";
import { botToken } from "../robots/index.js";
import { guardedGetText } from "../guard/index.js";
import type { FetchedPage, WalkDeps } from "../walk/index.js";

/** 크롤러 컨테이너(Crawl4AI REST API). compose 서비스 이름 `crawler` 로 프로젝트 네트워크 안에서만 닿는다. */
const defaultUrl = "http://crawler:11235";
/** 프로젝트 네트워크 안에서만 쓰는 값이라 비밀이 아니다(docker-compose.yml 의 CRAWL4AI_API_TOKEN 기본값과 같다). Crawl4AI 는 토큰이 있어야 컨테이너 밖 인터페이스에 바인딩한다. */
const defaultToken = "dualcontext-internal-network-only";

export const userAgent = `Mozilla/5.0 (compatible; ${botToken}-crawler/1.0)`;

type RawLink = { href?: string };
type RawResult = {
  success?: boolean;
  status_code?: number;
  error_message?: string;
  url?: string;
  redirected_url?: string;
  markdown?: string | { raw_markdown?: string; fit_markdown?: string };
  links?: { internal?: RawLink[] };
  metadata?: { title?: string | null };
};

/** Crawl4AI 에 한 URL 의 렌더링(헤드리스 Chromium)과 마크다운 변환을 맡기는 요청 본문. 본문은 가지치기 필터로 잡음(내비게이션·푸터)을 줄이고 링크·이미지는 글에서 뺀다. */
export function crawlRequest(url: string, timeoutMs: number) {
  return {
    urls: [url],
    // 브라우저가 스스로를 밝히는 이름을 robots.txt 에서 우리가 따르는 그룹(dualcontext)과 같게 한다.
    browser_config: { type: "BrowserConfig", params: { headless: true, user_agent: userAgent } },
    crawler_config: {
      type: "CrawlerRunConfig",
      params: {
        cache_mode: "bypass",
        page_timeout: timeoutMs,
        excluded_tags: ["nav", "footer", "header", "aside", "form", "script", "style"],
        exclude_external_links: true,
        markdown_generator: {
          type: "DefaultMarkdownGenerator",
          params: {
            content_filter: { type: "PruningContentFilter", params: { threshold: 0.48, threshold_type: "dynamic" } },
            options: { ignore_links: true, ignore_images: true }
          }
        }
      }
    }
  };
}

/** Crawl4AI 응답 한 건을 크롤 결과로 바꾼다. 실패(success=false, 4xx/5xx)는 던진다. */
export function toFetchedPage(requested: string, result: RawResult): FetchedPage {
  if (!result.success) throw new Error(result.error_message?.slice(0, 200) || "crawler reported failure");
  if (typeof result.status_code === "number" && result.status_code >= 400) throw new Error(`HTTP ${result.status_code}`);
  const markdown = typeof result.markdown === "string" ? result.markdown : result.markdown?.fit_markdown || result.markdown?.raw_markdown || "";
  return {
    finalUrl: result.redirected_url || result.url || requested,
    title: result.metadata?.title ?? "",
    markdown,
    links: (result.links?.internal ?? []).map((link) => link.href).filter((href): href is string => typeof href === "string")
  };
}

/** 취소할 수 있는 대기: 신호가 취소되면 즉시 취소 오류로 끝난다. */
function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal === undefined) return new Promise((resolve) => setTimeout(resolve, ms));
  return raceAbort(new Promise<void>((resolve) => setTimeout(resolve, ms)), signal);
}

/** 실제 네트워크에 붙는 크롤 의존성. robots.txt 는 이 서버가 SSRF 방어 fetch 로 직접 받는다. */
export function createWalkDeps(env: NodeJS.ProcessEnv = process.env): WalkDeps {
  const base = (env.DUALCONTEXT_CRAWLER_URL || defaultUrl).replace(/\/$/, "");
  const token = env.DUALCONTEXT_CRAWLER_TOKEN || defaultToken;
  return {
    now: () => Date.now(),
    sleep: (ms, signal) => sleepAbortable(ms, signal),
    async fetchRobots(origin, signal) {
      const response = await guardedGetText(`${origin}/robots.txt`, { maxBytes: 512 * 1024, timeoutMs: 10_000, userAgent, signal });
      if (response === null) throw new Error("robots.txt redirect loop");
      if (response.status >= 500) throw new Error(`robots.txt answered ${response.status}`);
      return response.status >= 400 ? null : response.text;
    },
    async fetchPage(url, signal) {
      const timeoutMs = 45_000;
      const response = await fetch(`${base}/crawl`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(crawlRequest(url, timeoutMs)),
        signal: signal === undefined ? AbortSignal.timeout(timeoutMs + 15_000) : AbortSignal.any([signal, AbortSignal.timeout(timeoutMs + 15_000)])
      });
      if (!response.ok) throw new Error(`crawler service answered ${response.status}: ${(await response.text()).slice(0, 160)}`);
      const json = (await response.json()) as { results?: RawResult[] };
      const [result] = json.results ?? [];
      if (!result) throw new Error("crawler service returned no result");
      return toFetchedPage(url, result);
    }
  };
}
