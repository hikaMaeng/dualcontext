import type { Provided } from "dualcontext_domain/server";
import { providedSectionTitle } from "dualcontext_domain/server";

/**
 * 사전 컨텍스트를 의존하는 아이템의 라이터에 넘기기 전에 다듬는다. see docs/internals.md#컨텍스트-계획기-결정
 * 실서버 run 235(아이템 10개 · 3단계)에서 최종 컨텍스트가 352,724자로 부풀었다: 템플릿 라이터가 사전 컨텍스트를 통째로 다시 담고,
 * 그 사전 컨텍스트 안에 또 그 아래 단계의 사전 컨텍스트 섹션이 들어 있어 깊이만큼 누적됐다.
 * 1) 중첩 제거: 아이템 컨텍스트 안의 「사전 제공된 컨텍스트」 섹션(머리글 기준)을 빼고 그 아이템 자체 자료만 건넨다.
 *    아래 단계 아이템은 각자 needs 로 직접 이어져 있으므로, 필요한 아이템은 그것을 따로 받는다.
 * 2) 길이 상한: 하나당 maxProvidedChars 자까지만 싣고 「(이하 N자 생략)」 표지를 붙인다.
 */

/** 머리글 줄이면 단계(# 개수), 아니면 0. */
const headingLevel = (line: string) => /^(#{1,6}) /.exec(line)?.[1].length ?? 0;

/**
 * 텍스트에서 「사전 제공된 컨텍스트」 머리글 섹션을 모두 뺀다. 섹션은 그 머리글부터 같은 단계 이하(# 개수가 같거나 적은)의 다음 머리글 직전까지다.
 * 템플릿 라이터는 섹션 안의 머리글을 섹션보다 깊게 낮춰 싣기 때문에 이 경계가 정확하다. 머리글이 없는 글(LLM 라이터의 자유 서술)은 그대로다.
 */
export function stripProvidedSections(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let skipping = 0;
  for (const line of lines) {
    const level = headingLevel(line);
    if (skipping > 0) {
      if (level === 0 || level > skipping) continue;
      skipping = 0;
    }
    if (level > 0 && line.slice(level + 1).trim() === providedSectionTitle) {
      skipping = level;
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** max 자를 넘으면 앞부분만 남기고 「(이하 N자 생략)」 표지를 붙인다(N = 버린 글자 수). */
export function clipProvided(text: string, max: number): string {
  if (text.length <= max) return text;
  const kept = text.slice(0, max).trimEnd();
  return `${kept}\n…(이하 ${text.length - kept.length}자 생략)`;
}

/** 라이터에 넘길 사전 컨텍스트: 중첩 섹션을 빼고 하나당 maxChars 로 자른다. 비게 된 것은 뺀다. */
export function prepareProvided(provided: Provided[], maxChars: number): Provided[] {
  return provided
    .map((entry) => ({ name: entry.name, context: clipProvided(stripProvidedSections(entry.context), maxChars) }))
    .filter((entry) => entry.context.trim() !== "");
}
