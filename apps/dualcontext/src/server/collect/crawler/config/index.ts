import { z } from "zod";

/**
 * 크롤러 조사원 설정과 상한. 상한은 관리자가 올릴 수 없는 하드 리밋이다(저장 시 400, 실행 시에도 같은 스키마로 다시 검증).
 *   maxPages ≤ 200, depth ≤ 3, 페이지당 글자 ≤ 100000, 전체 청크 ≤ 3000 — 한 조사원이 DB 와 임베딩 서버에 줄 수 있는 부하의 천장이다.
 */
export const limits = { maxPages: 200, maxDepth: 3, maxPageChars: 100_000, maxChunks: 3000, maxCrawlSeconds: 600, minDelayMs: 500 } as const;

const urlText = z.string().trim().min(1).max(2000);
const domain = z.string().trim().toLowerCase().regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/, "domain only (no scheme, no path)");

export const crawlerConfigSchema = z.object({
  /** 시작 URL(1~10개). 모두 허용 도메인 안이어야 한다. */
  startUrls: z.array(urlText).min(1).max(10),
  /** 허용 도메인. 비우면 시작 URL 의 호스트로 한정한다. `example.com` 은 하위 도메인(docs.example.com)도 허용한다. */
  allowedDomains: z.array(domain).max(10).default([]),
  /** 시작 URL 에서 링크를 따라가는 깊이. 0 이면 시작 페이지들만. */
  depth: z.number().int().min(0).max(limits.maxDepth).default(1),
  maxPages: z.number().int().min(1).max(limits.maxPages).default(30),
  /** 경로 포함/제외 패턴(정규식 문자열). 제외가 먼저 적용된다. */
  includePatterns: z.array(z.string().max(200)).max(10).default([]),
  excludePatterns: z.array(z.string().max(200)).max(10).default([]),
  /** 같은 호스트에 대한 요청 간격(ms). robots.txt 의 Crawl-delay 가 더 크면 그 값을 쓴다. */
  delayMs: z.number().int().min(limits.minDelayMs).max(60_000).default(1000),
  /** 캐시가 이 시간보다 오래되면 질의 때 백그라운드로 다시 크롤한다(옛 캐시로 먼저 답한다). */
  refreshHours: z.number().int().min(1).max(720).default(24),
  /** 크롤 한 번의 총 시간 상한(초). 넘으면 거기까지 모은 것으로 색인한다. */
  maxCrawlSeconds: z.number().int().min(10).max(limits.maxCrawlSeconds).default(120),
  chunkChars: z.number().int().min(300).max(4000).default(1000),
  /** 이 유사도 미만 조각은 버린다(0 이면 거르지 않음). */
  minScore: z.number().min(0).max(1).default(0.5),
  /** 같은 페이지에서 가져오는 조각 수 상한(한 페이지가 결과를 독점하지 않게). */
  perPage: z.number().int().min(1).max(5).default(2),
  topK: z.number().int().min(1).max(20).default(3)
});

export type CrawlerConfig = z.infer<typeof crawlerConfigSchema>;

/** 저장된 jsonb 를 검증해 기본값을 채운다. 어긋나면 던진다(수집 실패로 표시된다). 정규식은 컴파일까지 확인한다. */
export function parseCrawlerConfig(raw: unknown): CrawlerConfig {
  const config = crawlerConfigSchema.parse(raw);
  for (const pattern of [...config.includePatterns, ...config.excludePatterns]) new RegExp(pattern);
  return config;
}

/** 크롤 대상이 바뀌었는지 가르는 지문. 이 값이 달라지면 캐시를 버리고 처음부터 다시 크롤한다(topK·minScore·refreshHours 는 포함하지 않는다). */
export function crawlFingerprint(config: CrawlerConfig): string {
  const { startUrls, allowedDomains, depth, maxPages, includePatterns, excludePatterns, chunkChars } = config;
  return JSON.stringify({ startUrls, allowedDomains, depth, maxPages, includePatterns, excludePatterns, chunkChars });
}

/** 호스트가 허용 도메인(또는 시작 URL 호스트)에 속하는지. */
export function hostAllowed(host: string, config: CrawlerConfig): boolean {
  const name = host.toLowerCase();
  const allowed = config.allowedDomains.length > 0 ? config.allowedDomains : config.startUrls.map((url) => safeHost(url)).filter((value): value is string => value !== null);
  return allowed.some((domainName) => name === domainName || name.endsWith(`.${domainName}`));
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** 링크 정규화: 해시 제거, 추적 파라미터 제거, 끝 슬래시 정리. 같은 페이지가 두 번 들어가지 않게 한다. */
export function normalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return url.href;
}

const binaryExtension = /\.(png|jpe?g|gif|svg|webp|ico|pdf|zip|gz|tgz|tar|mp4|mp3|wav|woff2?|ttf|css|js|json|xml|exe|dmg)$/i;

/** 따라갈 링크인지: 확장자(바이너리·정적 파일) · 포함/제외 패턴을 본다. 도메인·SSRF 는 호출자가 따로 본다. */
export function linkWanted(url: URL, config: CrawlerConfig): boolean {
  if (binaryExtension.test(url.pathname)) return false;
  const target = `${url.pathname}${url.search}`;
  if (config.excludePatterns.some((pattern) => new RegExp(pattern).test(target))) return false;
  return config.includePatterns.length === 0 || config.includePatterns.some((pattern) => new RegExp(pattern).test(target));
}
