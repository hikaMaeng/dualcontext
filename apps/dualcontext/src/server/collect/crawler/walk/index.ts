import { hostAllowed, limits, linkWanted, normalizeUrl, type CrawlerConfig } from "../config/index.js";
import { assertPublicUrl, type Resolver } from "../guard/index.js";
import { allowAll, denyAll, isAllowed, parseRobots, type Robots } from "../robots/index.js";

export type FetchedPage = { finalUrl: string; title: string; markdown: string; links: string[] };
export type CrawledPage = { url: string; title: string; markdown: string };

/** 밖과 닿는 부분을 주입받아 순서·한도·예의 규칙만 단위 시험할 수 있게 한다. */
export type WalkDeps = {
  fetchPage: (url: string) => Promise<FetchedPage>;
  /** 한 origin 의 robots.txt 본문. 없으면(404 등) null, 서버 오류·접속 실패는 던진다(그 origin 은 이번 크롤에서 금지로 본다). */
  fetchRobots: (origin: string) => Promise<string | null>;
  resolve?: Resolver;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export type WalkResult = {
  pages: CrawledPage[];
  skipped: { url: string; reason: string }[];
  /** 한도(시간·페이지 수)에 걸려 일찍 멈췄는가. */
  truncated: boolean;
};

/**
 * 너비 우선 크롤. 매 URL 마다: 한도 확인 → SSRF 검사 → 허용 도메인 → robots.txt → 호스트별 요청 간격 → 가져오기 →
 * 리다이렉트 후 최종 URL 재검사(내부망이나 허용 밖으로 빠졌으면 내용을 버린다) → 링크 추출.
 * 페이지 하나가 실패해도 크롤은 계속한다(사유는 skipped).
 */
export async function walk(config: CrawlerConfig, deps: WalkDeps): Promise<WalkResult> {
  const deadline = deps.now() + config.maxCrawlSeconds * 1000;
  const result: WalkResult = { pages: [], skipped: [], truncated: false };
  const robotsByOrigin = new Map<string, Robots>();
  const lastRequestAt = new Map<string, number>();
  const seen = new Set<string>();
  const stored = new Set<string>();
  let queue: { url: string; depth: number }[] = [];

  const enqueue = (raw: string, depth: number) => {
    const url = normalizeUrl(raw);
    if (url === null || seen.has(url)) return;
    seen.add(url);
    queue.push({ url, depth });
  };
  for (const start of config.startUrls) enqueue(start, 0);

  const robotsFor = async (origin: string): Promise<Robots> => {
    const known = robotsByOrigin.get(origin);
    if (known) return known;
    let robots: Robots;
    try {
      const body = await deps.fetchRobots(origin);
      robots = body === null ? allowAll : parseRobots(body);
    } catch {
      robots = denyAll;
    }
    robotsByOrigin.set(origin, robots);
    return robots;
  };

  while (queue.length > 0) {
    const item = queue.shift() as { url: string; depth: number };
    if (stored.size >= config.maxPages || deps.now() >= deadline) {
      result.truncated = true;
      break;
    }
    const skip = (reason: string) => void result.skipped.push({ url: item.url, reason });
    let url: URL;
    try {
      url = await assertPublicUrl(item.url, deps.resolve);
    } catch (error) {
      skip(`blocked: ${(error as Error).message}`);
      continue;
    }
    if (!hostAllowed(url.hostname, config)) {
      skip("domain not allowed");
      continue;
    }
    const robots = await robotsFor(url.origin);
    if (!isAllowed(robots, `${url.pathname}${url.search}`)) {
      skip("disallowed by robots.txt");
      continue;
    }
    const delay = Math.max(config.delayMs, (robots.crawlDelaySeconds ?? 0) * 1000);
    const previous = lastRequestAt.get(url.host);
    const wait = previous === undefined ? 0 : previous + delay - deps.now();
    if (wait > 0) {
      // 기다린 뒤에는 이미 시간 상한을 넘기므로 기다리지 않고 여기서 끝낸다.
      if (deps.now() + wait >= deadline) {
        result.truncated = true;
        break;
      }
      await deps.sleep(wait);
    }
    lastRequestAt.set(url.host, deps.now());

    let page: FetchedPage;
    try {
      page = await deps.fetchPage(url.href);
    } catch (error) {
      skip(`fetch failed: ${(error as Error).message}`);
      continue;
    }
    let finalUrl: URL;
    try {
      finalUrl = await assertPublicUrl(page.finalUrl, deps.resolve);
    } catch (error) {
      skip(`redirected to a blocked address: ${(error as Error).message}`);
      continue;
    }
    if (!hostAllowed(finalUrl.hostname, config)) {
      skip("redirected outside allowed domains");
      continue;
    }
    const finalKey = normalizeUrl(finalUrl.href) ?? finalUrl.href;
    const markdown = page.markdown.trim().slice(0, limits.maxPageChars);
    if (markdown === "") {
      skip("empty page");
      continue;
    }
    if (!stored.has(finalKey)) {
      stored.add(finalKey);
      seen.add(finalKey);
      result.pages.push({ url: finalKey, title: page.title.trim().slice(0, 300), markdown });
    }
    if (item.depth < config.depth) {
      for (const link of page.links) {
        let target: URL;
        try {
          target = new URL(link, finalUrl);
        } catch {
          continue;
        }
        if ((target.protocol === "http:" || target.protocol === "https:") && hostAllowed(target.hostname, config) && linkWanted(target, config)) enqueue(target.href, item.depth + 1);
      }
    }
    queue = queue.slice(0, limits.maxPages * 20);
  }
  return result;
}
