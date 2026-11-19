import assert from "node:assert/strict";
import test from "node:test";
import { isAllowed, parseRobots } from "./index.js";
import { matches, robotsLimits } from "./match.js";

/** 교체 전 구현(정규식). 의미 기준으로만 남긴 시험용 사본이다. */
function legacyMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const expression = body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${expression}${anchored ? "$" : ""}`).test(path);
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("robots 매칭: 수만 개 무작위 (패턴, 경로) 에서 교체 전 정규식과 결과가 같다", () => {
  const next = random(20261119);
  const patternAlphabet = ["a", "b", "x", "/", "*", "*", "$", ".", "?", "+", "(", "\\", "a", "b"];
  const pathAlphabet = ["a", "b", "x", "/", ".", "?", "+", "(", "\\", "$", "a", "b"];
  const pick = (alphabet: string[], length: number) => Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]).join("");
  let compared = 0;
  let matched = 0;
  for (let index = 0; index < 60_000; index += 1) {
    const pattern = pick(patternAlphabet, Math.floor(next() * 12));
    const path = pick(pathAlphabet, Math.floor(next() * 22));
    const expected = legacyMatches(pattern, path);
    assert.equal(matches(pattern, path), expected, `${JSON.stringify(pattern)} vs ${JSON.stringify(path)}`);
    compared += 1;
    if (expected) matched += 1;
  }
  assert.equal(compared, 60_000);
  // 일치 · 불일치가 모두 충분히 섞여 있어야 시험이 의미가 있다.
  assert.ok(matched > 3000 && matched < 57_000, `matched=${matched}`);
});

test("robots 매칭: 고정 사례(접두, 와일드카드, $ 고정, 정규식 문자는 리터럴)", () => {
  assert.equal(matches("/private", "/private/a"), true);
  assert.equal(matches("/private", "/priv"), false);
  assert.equal(matches("/*.pdf$", "/a/b.pdf"), true);
  assert.equal(matches("/*.pdf$", "/a/b.pdf?x=1"), false);
  assert.equal(matches("/a*b*c", "/aXbYc/z"), true);
  assert.equal(matches("/a*b*c", "/aXcYb"), false);
  assert.equal(matches("/a.b", "/aXb"), false);
  assert.equal(matches("/a$", "/a"), true);
  assert.equal(matches("/a$", "/ab"), false);
  assert.equal(matches("*", "/anything"), true);
  assert.equal(matches("/a*$", "/a"), true);
  assert.equal(matches("/a**b", "/ab"), true);
  assert.equal(matches("/ab*ab$", "/ab"), false);
  assert.equal(matches("/ab*ab$", "/abab"), true);
});

test("robots 매칭: 정규식 폭주 패턴이 상한 길이 경로에서도 즉시 끝난다(ReDoS 회귀)", () => {
  const pattern = "/*a*a*a*a*a*a*a*b";
  const path = `/${"a".repeat(2000)}`;
  const started = performance.now();
  for (let round = 0; round < 50; round += 1) assert.equal(matches(pattern, path), false);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 250, `50 회 ${elapsed.toFixed(1)}ms`);
  const robots = parseRobots(`User-agent: *\nDisallow: ${pattern}\nDisallow: /*a*a*a*a*a*a*a*a*a*a*a*b$\n`);
  const single = performance.now();
  assert.equal(isAllowed(robots, path), true);
  assert.ok(performance.now() - single < 50);
});

test("robots 상한: 경로는 앞 2048자만, 규칙은 앞 200개만, 256자 넘는 패턴은 Allow 버림 · Disallow 접두화", () => {
  assert.equal(robotsLimits.pathChars, 2048);
  const tailBlocked = parseRobots("User-agent: *\nDisallow: /*zzz$\n");
  assert.equal(isAllowed(tailBlocked, `/${"a".repeat(3000)}zzz`), true, "잘린 경로에서는 $ 로 끝나는 규칙이 맞지 않는다");
  assert.equal(isAllowed(tailBlocked, "/ok/zzz"), false);

  const lines = Array.from({ length: 250 }, (_, i) => `Disallow: /r${i}/`).join("\n");
  const many = parseRobots(`User-agent: *\n${lines}\n`);
  assert.equal(many.rules.length, 200);
  assert.equal(isAllowed(many, "/r199/x"), false);
  assert.equal(isAllowed(many, "/r200/x"), true, "201번째 이후 규칙은 쓰지 않는다");

  const long = `/${"p".repeat(300)}`;
  const folded = parseRobots(`User-agent: *\nDisallow: ${long}$\nAllow: ${long}x\n`);
  assert.equal(folded.rules.length, 1);
  assert.equal(folded.rules[0]?.allow, false);
  assert.equal(folded.rules[0]?.pattern.length, 256);
  assert.equal(isAllowed(folded, `${long}more`), false, "Disallow 는 접두 규칙으로 남아 금지가 풀리지 않는다");
});

test("robots isAllowed 의미: 최장 일치가 이기고 같은 길이면 Allow, 이스케이프 문자는 리터럴", () => {
  const robots = parseRobots("User-agent: *\nDisallow: /a\nAllow: /a\nDisallow: /b/\nAllow: /b/open\nDisallow: /p+q\n");
  assert.equal(isAllowed(robots, "/a/x"), true);
  assert.equal(isAllowed(robots, "/b/closed"), false);
  assert.equal(isAllowed(robots, "/b/open/1"), true);
  assert.equal(isAllowed(robots, "/p+q"), false);
  assert.equal(isAllowed(robots, "/ppq"), true);
});
