import assert from "node:assert/strict";
import test from "node:test";
import { chunkMarkdown } from "./index.js";
import { maxTitleLineChars, parseTitle } from "./title.js";

/** 교체 전 정규식. 의미 기준으로만 남긴 시험용 사본이다. */
const legacy = (line: string): string | null => line.match(/^#{1,4}\s+(.+?)\s*#*$/)?.[1] ?? null;

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

test("제목 줄: 수만 개 무작위 줄에서 옛 정규식과 결과가 같다(경계 사례 포함)", () => {
  const next = random(777);
  const alphabet = ["#", "#", "#", " ", " ", "\t", "a", "b", "한", String.fromCharCode(0xa0), String.fromCharCode(0x3000), String.fromCharCode(0x2028), "\r", "x"];
  let titles = 0;
  for (let index = 0; index < 80_000; index += 1) {
    const length = Math.floor(next() * 14);
    const line = Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]).join("");
    assert.equal(parseTitle(line), legacy(line), JSON.stringify(line));
    if (legacy(line) !== null) titles += 1;
  }
  assert.ok(titles > 2000, `titles=${titles}`);
});

test("제목 줄: 고정 사례", () => {
  assert.equal(parseTitle("# 소개"), "소개");
  assert.equal(parseTitle("#### 깊은 제목 ####"), "깊은 제목");
  assert.equal(parseTitle("##### 다섯"), null);
  assert.equal(parseTitle("#없음"), null);
  assert.equal(parseTitle("## C# 언어 ##"), "C# 언어");
  assert.equal(parseTitle("본문 # 아님"), null);
});

test("제목 줄: 공백이 긴 줄과 4000자 초과 줄은 즉시 끝나고, 초과 줄은 제목이 아니라 본문이다(동작 변경)", () => {
  const spaced = `# a${" ".repeat(200_000)}b`;
  const started = performance.now();
  assert.equal(parseTitle(spaced), null);
  assert.ok(performance.now() - started < 50);
  assert.equal(parseTitle(`# ${"가".repeat(maxTitleLineChars - 2)}`), "가".repeat(maxTitleLineChars - 2));
  const chunks = chunkMarkdown(`# ${"가".repeat(maxTitleLineChars + 10)}\n\n본문 문단이 마흔 글자를 넘기도록 조금 길게 써 둔다 아주 길게 길게 길게.`, 5000);
  assert.equal(chunks[0]?.heading, "");
});
