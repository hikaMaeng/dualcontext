/** 크롤러가 robots.txt 에서 자신을 가리키는 이름. User-Agent 헤더에도 같은 토큰을 쓴다. */
export const botToken = "dualcontext";

type Rule = { allow: boolean; pattern: string };
export type Robots = { rules: Rule[]; crawlDelaySeconds: number | null };

/** robots.txt 가 없다(404 등)거나 읽을 수 없을 때의 값: 전부 허용. 단 5xx 는 호출자가 「전부 금지」로 다룬다. */
export const allowAll: Robots = { rules: [], crawlDelaySeconds: null };
export const denyAll: Robots = { rules: [{ allow: false, pattern: "/" }], crawlDelaySeconds: null };

/**
 * robots.txt 를 해석한다. 이 봇 이름에 맞는 그룹이 있으면 그것만, 없으면 `*` 그룹을 쓴다(RFC 9309).
 * 경로 규칙은 가장 긴 패턴이 이기고, 같으면 Allow 가 이긴다. `*` 와끝 `$` 를 지원한다.
 */
export function parseRobots(text: string): Robots {
  const groups: { agents: string[]; rules: Rule[]; delay: number | null }[] = [];
  let current: (typeof groups)[number] | null = null;
  let collectingAgents = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!collectingAgents || current === null) {
        current = { agents: [], rules: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      collectingAgents = true;
      continue;
    }
    collectingAgents = false;
    if (current === null) continue;
    if (field === "allow" || field === "disallow") {
      if (value !== "") current.rules.push({ allow: field === "allow", pattern: value });
    } else if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.delay = seconds;
    }
  }
  const mine = groups.filter((group) => group.agents.some((agent) => agent === botToken));
  const chosen = mine.length > 0 ? mine : groups.filter((group) => group.agents.includes("*"));
  return {
    rules: chosen.flatMap((group) => group.rules),
    crawlDelaySeconds: chosen.map((group) => group.delay).find((delay) => delay !== null) ?? null
  };
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const expression = body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${expression}${anchored ? "$" : ""}`).test(path);
}

/** path 는 경로 + 쿼리(`/a/b?x=1`). 일치하는 규칙이 없으면 허용. */
export function isAllowed(robots: Robots, path: string): boolean {
  let best: Rule | null = null;
  for (const rule of robots.rules) {
    if (!matches(rule.pattern, path)) continue;
    if (best === null || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best === null ? true : best.allow;
}
