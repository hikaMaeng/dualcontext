import assert from "node:assert/strict";
import test from "node:test";
import { crawlRequest, toFetchedPage } from "./client/index.js";
import { chunkMarkdown } from "./chunk/index.js";
import { crawlFingerprint, hostAllowed, linkWanted, normalizeUrl, parseCrawlerConfig } from "./config/index.js";
import { assertPublicUrl, BlockedUrlError, isBlockedAddress, isInternalHostname } from "./guard/index.js";
import { isAllowed, parseRobots } from "./robots/index.js";
import { cosine, rankHits } from "./store/index.js";
import { walk, type WalkDeps } from "./walk/index.js";
import { isStale } from "./index.js";

test("SSRF: 사설·루프백·링크 로컬·메타데이터·예약 IPv4 는 막고 공인 주소는 허용한다", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1"]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
  for (const address of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34", "151.101.1.69"]) assert.equal(isBlockedAddress(address), false, address);
});

test("SSRF: IPv6 루프백·고유 로컬·링크 로컬·IPv4 매핑·NAT64 는 막고 공인 IPv6 는 허용한다", () => {
  for (const address of ["::1", "::", "fe80::1", "fd00:ec2::254", "fc00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::a00:1", "ff02::1", "2001:db8::1", "not-an-ip"]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
  for (const address of ["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) assert.equal(isBlockedAddress(address), false, address);
});

test("SSRF: localhost·점 없는 이름(compose 서비스)·내부 접미사는 이름만으로 거부한다", () => {
  for (const host of ["localhost", "foo.localhost", "dualcontext", "crawler", "db.internal", "printer.local", "metadata.google.internal", "svc.cluster.local"]) assert.equal(isInternalHostname(host), true, host);
  for (const host of ["example.com", "docs.python.org", "1.2.3.4"]) assert.equal(isInternalHostname(host), false, host);
});

test("SSRF: assertPublicUrl 은 스킴·포트·사용자 정보·내부 해석 결과를 거부하고 공인 호스트만 통과시킨다", async () => {
  const resolveTo = (...addresses: string[]) => async () => addresses;
  await assert.rejects(assertPublicUrl("file:///etc/passwd"), BlockedUrlError);
  await assert.rejects(assertPublicUrl("ftp://example.com/"), /scheme/);
  await assert.rejects(assertPublicUrl("http://user:pw@example.com/"), /credentials/);
  await assert.rejects(assertPublicUrl("http://example.com:5432/", resolveTo("93.184.216.34")), /port/);
  await assert.rejects(assertPublicUrl("http://127.0.0.1/"), /non-public/);
  await assert.rejects(assertPublicUrl("http://[::1]/"), /non-public/);
  await assert.rejects(assertPublicUrl("http://169.254.169.254/latest/meta-data/"), /non-public/);
  await assert.rejects(assertPublicUrl("http://2130706433/"), /non-public/); // 10진 정수 표기의 127.0.0.1 은 URL 파서가 127.0.0.1 로 바꾼다
  await assert.rejects(assertPublicUrl("http://evil.example/", resolveTo("93.184.216.34", "10.0.0.5")), /non-public/); // 하나라도 내부면 거부
  await assert.rejects(assertPublicUrl("http://evil.example/", resolveTo()), /does not resolve/);
  await assert.rejects(assertPublicUrl("http://dualcontext/"), /internal host/);
  assert.equal((await assertPublicUrl("https://docs.example.com/a?b=1", resolveTo("93.184.216.34"))).hostname, "docs.example.com");
});

test("robots.txt: 이 봇 그룹이 있으면 그것만, 없으면 *; 가장 긴 규칙이 이기고 같으면 Allow; 와일드카드와 $", () => {
  const robots = parseRobots(`
User-agent: *
Disallow: /private
Allow: /private/open
Disallow: /*.pdf$
Crawl-delay: 3

User-agent: dualcontext
Disallow: /only-me
`);
  assert.equal(isAllowed(robots, "/only-me/x"), false);
  assert.equal(isAllowed(robots, "/private/a"), true); // 이 봇의 그룹이 있으면 * 그룹은 적용하지 않는다
  const generic = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/open\nDisallow: /*.pdf$\nCrawl-delay: 3\n");
  assert.equal(isAllowed(generic, "/private/a"), false);
  assert.equal(isAllowed(generic, "/private/open/a"), true);
  assert.equal(isAllowed(generic, "/doc.pdf"), false);
  assert.equal(isAllowed(generic, "/doc.pdf?x=1"), true);
  assert.equal(isAllowed(generic, "/public"), true);
  assert.equal(generic.crawlDelaySeconds, 3);
  assert.equal(isAllowed(parseRobots("User-agent: *\nDisallow: /\n"), "/anything"), false);
  assert.equal(isAllowed(parseRobots("User-agent: *\nDisallow:\n"), "/anything"), true);
});

test("설정: 기본값을 채우고 상한을 넘는 값·잘못된 정규식은 거부한다", () => {
  const config = parseCrawlerConfig({ startUrls: ["https://example.com/docs"] });
  assert.equal(config.depth, 1);
  assert.equal(config.maxPages, 30);
  assert.equal(config.delayMs, 1000);
  assert.equal(config.refreshHours, 24);
  assert.throws(() => parseCrawlerConfig({ startUrls: ["https://example.com"], maxPages: 201 }));
  assert.throws(() => parseCrawlerConfig({ startUrls: ["https://example.com"], depth: 4 }));
  assert.throws(() => parseCrawlerConfig({ startUrls: ["https://example.com"], delayMs: 10 }));
  assert.throws(() => parseCrawlerConfig({ startUrls: [] }));
  assert.throws(() => parseCrawlerConfig({ startUrls: ["https://example.com"], excludePatterns: ["("] }));
});

test("설정: 허용 도메인은 하위 도메인을 포함하고, 비우면 시작 URL 호스트로 한정한다", () => {
  const open = parseCrawlerConfig({ startUrls: ["https://docs.example.com/a"] });
  assert.equal(hostAllowed("docs.example.com", open), true);
  assert.equal(hostAllowed("example.com", open), false);
  assert.equal(hostAllowed("evil-docs.example.com.attacker.io", open), false);
  const domains = parseCrawlerConfig({ startUrls: ["https://example.com/"], allowedDomains: ["example.com"] });
  assert.equal(hostAllowed("a.b.example.com", domains), true);
  assert.equal(hostAllowed("notexample.com", domains), false);
});

test("설정: 지문은 크롤 대상이 바뀔 때만 달라지고 검색 설정(topK)에는 반응하지 않는다", () => {
  const base = parseCrawlerConfig({ startUrls: ["https://example.com/"] });
  assert.equal(crawlFingerprint(base), crawlFingerprint({ ...base, topK: 9, minScore: 0.1, refreshHours: 1 }));
  assert.notEqual(crawlFingerprint(base), crawlFingerprint({ ...base, depth: 2 }));
});

test("링크 정규화와 선별: 해시·추적 파라미터 제거, 바이너리 제외, 제외 패턴 우선", () => {
  assert.equal(normalizeUrl("https://example.com/a/?utm_source=x&id=1#top"), "https://example.com/a?id=1");
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
  const config = parseCrawlerConfig({ startUrls: ["https://example.com/"], includePatterns: ["^/docs"], excludePatterns: ["^/docs/old"] });
  assert.equal(linkWanted(new URL("https://example.com/docs/a"), config), true);
  assert.equal(linkWanted(new URL("https://example.com/docs/old/a"), config), false);
  assert.equal(linkWanted(new URL("https://example.com/blog"), config), false);
  assert.equal(linkWanted(new URL("https://example.com/docs/logo.png"), config), false);
});

test("청크: 제목에서 끊고 제목을 앞에 붙이며, 긴 절은 한도 안으로 쪼갠다", () => {
  const long = Array.from({ length: 30 }, (_, i) => `문장 번호 ${i} 는 충분히 긴 내용을 담고 있습니다.`).join(" ");
  const chunks = chunkMarkdown(`# 소개\n\n짧은 소개 글이 여기 있다. 소개 문단은 마흔 글자를 넘기도록 조금 더 길게 쓴다.\n\n## 상세\n\n${long}`, 300);
  assert.equal(chunks[0].heading, "소개");
  assert.ok(chunks[0].text.startsWith("소개\n"));
  assert.ok(chunks.length >= 4);
  for (const chunk of chunks) assert.ok(chunk.text.length <= 300 + chunk.heading.length + 1, `${chunk.text.length}`);
  assert.deepEqual(chunks.map((chunk) => chunk.index), chunks.map((_, i) => i));
  assert.deepEqual(chunkMarkdown("  \n", 300), []);
  // 코드 펜스 안의 # 는 제목이 아니다.
  assert.equal(chunkMarkdown("# A\n\n```\n# not heading\n```\n\n텍스트가 충분히 길어야 한다 아주 아주 길게 써서 합쳐지지 않게.", 1000).every((chunk) => chunk.heading === "A"), true);
});

test("랭킹: 점수 미달 제거, 페이지당 상한, 상위 topK", () => {
  const hit = (url: string, score: number) => ({ url, title: url, text: `${url}:${score}`, score });
  const ranked = rankHits([hit("a", 0.9), hit("a", 0.8), hit("a", 0.7), hit("b", 0.6), hit("c", 0.3), hit("d", 0.55)], { minScore: 0.5, perPage: 2, topK: 4 });
  assert.deepEqual(ranked.map((entry) => entry.text), ["a:0.9", "a:0.8", "b:0.6", "d:0.55"]);
  assert.equal(rankHits([hit("a", 0.9)], { minScore: 0.95, perPage: 2, topK: 3 }).length, 0);
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  assert.equal(cosine([1, 0], [0, 1]), 0);
});

test("갱신 판단: 끝난 적이 없거나 refreshHours 를 넘기면 오래된 것", () => {
  const config = parseCrawlerConfig({ startUrls: ["https://example.com/"], refreshHours: 2 });
  const now = Date.parse("2026-11-15T12:00:00Z");
  const state = (finishedAt: string | null) => ({ fingerprint: "x", status: "ok" as const, startedAt: null, finishedAt: finishedAt === null ? null : new Date(finishedAt), pages: 1, chunks: 1, error: null });
  assert.equal(isStale(null, config, now), true);
  assert.equal(isStale(state(null), config, now), true);
  assert.equal(isStale(state("2026-11-15T10:30:00Z"), config, now), false);
  assert.equal(isStale(state("2026-11-15T09:59:00Z"), config, now), true);
});

type Site = Record<string, { markdown?: string; links?: string[]; finalUrl?: string; fail?: boolean }>;

function fakeDeps(site: Site, robots: Record<string, string | null | "error"> = {}) {
  let clock = 0;
  const fetched: string[] = [];
  const sleeps: number[] = [];
  const deps: WalkDeps = {
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    resolve: async () => ["93.184.216.34"],
    fetchRobots: async (origin) => {
      const value = robots[origin] ?? null;
      if (value === "error") throw new Error("robots 500");
      return value;
    },
    fetchPage: async (url) => {
      fetched.push(url);
      const page = site[url];
      if (!page || page.fail) throw new Error("boom");
      return { finalUrl: page.finalUrl ?? url, title: `t ${url}`, markdown: page.markdown ?? "내용 ".repeat(20), links: page.links ?? [] };
    }
  };
  return { deps, fetched, sleeps };
}

test("워크: 깊이·최대 페이지·허용 도메인·중복을 지키고 호스트별 요청 간격을 둔다", async () => {
  const { deps, fetched, sleeps } = fakeDeps({
    "https://example.com/": { links: ["/a", "/b", "https://other.org/x", "/a#frag", "/doc.pdf", "mailto:x@y.z"] },
    "https://example.com/a": { links: ["/deep"] },
    "https://example.com/b": {},
    "https://example.com/deep": {}
  });
  const config = parseCrawlerConfig({ startUrls: ["https://example.com/"], depth: 1, maxPages: 10, delayMs: 1000 });
  const result = await walk(config, deps);
  assert.deepEqual(fetched, ["https://example.com/", "https://example.com/a", "https://example.com/b"]);
  assert.deepEqual(result.pages.map((page) => page.url), fetched);
  assert.equal(sleeps.length, 2); // 첫 요청 뒤 두 번, 매번 delayMs
  assert.ok(sleeps.every((ms) => ms === 1000));
  const limited = await walk(parseCrawlerConfig({ startUrls: ["https://example.com/"], depth: 3, maxPages: 2 }), fakeDeps({ "https://example.com/": { links: ["/a", "/b"] }, "https://example.com/a": {}, "https://example.com/b": {} }).deps);
  assert.equal(limited.pages.length, 2);
  assert.equal(limited.truncated, true);
});

test("워크: robots.txt 금지 경로와 robots 오류(5xx·접속 실패)는 가져오지 않고, Crawl-delay 가 더 크면 그 간격을 쓴다", async () => {
  const blocked = fakeDeps({ "https://example.com/": { links: ["/private/x", "/ok"] }, "https://example.com/ok": {}, "https://example.com/private/x": {} }, { "https://example.com": "User-agent: *\nDisallow: /private\nCrawl-delay: 5" });
  const result = await walk(parseCrawlerConfig({ startUrls: ["https://example.com/"], depth: 1 }), blocked.deps);
  assert.deepEqual(blocked.fetched, ["https://example.com/", "https://example.com/ok"]);
  assert.ok(result.skipped.some((entry) => entry.reason.includes("robots")));
  assert.deepEqual(blocked.sleeps, [5000]);
  const broken = fakeDeps({ "https://example.com/": {} }, { "https://example.com": "error" });
  const none = await walk(parseCrawlerConfig({ startUrls: ["https://example.com/"] }), broken.deps);
  assert.equal(broken.fetched.length, 0);
  assert.equal(none.pages.length, 0);
});

test("워크: 내부 주소로 해석되는 호스트와 내부 주소로 리다이렉트된 결과는 버린다", async () => {
  const internal = fakeDeps({ "https://example.com/": {} });
  internal.deps.resolve = async () => ["10.0.0.7"];
  const first = await walk(parseCrawlerConfig({ startUrls: ["https://example.com/"] }), internal.deps);
  assert.equal(internal.fetched.length, 0);
  assert.match(first.skipped[0].reason, /blocked/);

  const redirect = fakeDeps({ "https://example.com/": { finalUrl: "http://169.254.169.254/latest/meta-data/", markdown: "secret ".repeat(10) }, "https://example.com/b": { finalUrl: "https://elsewhere.org/", markdown: "x ".repeat(40) } });
  const second = await walk(parseCrawlerConfig({ startUrls: ["https://example.com/", "https://example.com/b"] }), redirect.deps);
  assert.equal(second.pages.length, 0);
  assert.ok(second.skipped.some((entry) => entry.reason.includes("blocked address")));
  assert.ok(second.skipped.some((entry) => entry.reason.includes("outside allowed domains")));
});

test("워크: 총 시간 상한이 지나면 거기서 멈추고, 한 페이지의 실패는 크롤을 멈추지 않는다", async () => {
  const { deps, fetched } = fakeDeps({ "https://example.com/": { links: ["/bad", "/good"] }, "https://example.com/bad": { fail: true }, "https://example.com/good": {} });
  const result = await walk(parseCrawlerConfig({ startUrls: ["https://example.com/"], depth: 1 }), deps);
  assert.deepEqual(fetched, ["https://example.com/", "https://example.com/bad", "https://example.com/good"]);
  assert.equal(result.pages.length, 2);
  assert.ok(result.skipped.some((entry) => entry.reason.startsWith("fetch failed")));
  const slow = fakeDeps({ "https://example.com/": { links: ["/a"] }, "https://example.com/a": {} });
  const config = parseCrawlerConfig({ startUrls: ["https://example.com/"], depth: 1, maxCrawlSeconds: 10, delayMs: 60_000 });
  const cut = await walk(config, slow.deps);
  assert.equal(cut.truncated, true);
  assert.equal(cut.pages.length, 1);
});

test("클라이언트: Crawl4AI 응답을 크롤 결과로 바꾸고 실패·HTTP 오류는 던진다", () => {
  const ok = toFetchedPage("https://example.com/a", {
    success: true, status_code: 200, redirected_url: "https://example.com/b", metadata: { title: "제목" },
    markdown: { raw_markdown: "원문", fit_markdown: "" }, links: { internal: [{ href: "/x" }, {}] }
  });
  assert.deepEqual(ok, { finalUrl: "https://example.com/b", title: "제목", markdown: "원문", links: ["/x"] });
  assert.equal(toFetchedPage("https://example.com/a", { success: true, markdown: { raw_markdown: "원문", fit_markdown: "정제" } }).markdown, "정제");
  assert.throws(() => toFetchedPage("https://example.com/a", { success: false, error_message: "timeout" }), /timeout/);
  assert.throws(() => toFetchedPage("https://example.com/a", { success: true, status_code: 404 }), /HTTP 404/);
  const request = crawlRequest("https://example.com/a", 45_000);
  assert.deepEqual(request.urls, ["https://example.com/a"]);
  assert.equal(request.crawler_config.params.cache_mode, "bypass");
});
