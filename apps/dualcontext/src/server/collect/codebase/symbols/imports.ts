/**
 * import 지정자 추출기. 파일 전체에 `^\s*…` + `m` 정규식을 돌리던 방식(`\s*` 가 개행을 넘나들어 빈 줄이 많은 파일에서 이차 시간)을
 * 줄 단위 스캔으로 바꾼 것이다. 줄마다 정규식을 따로 돌리고, 여러 줄에 걸친 문장은 아래 두 가지 상태로만 이어 붙인다.
 *
 * - 열린 문장(`open`): 줄이 `require(` · `import(` · `from` · 홀로 선 `import` 로 끝나면 다음 줄들(최대 6줄, 빈 줄 포함)을 이어 붙여 `joined` 로 확인한다.
 * - 블록(`block`, Go `import ( … )`): 시작 줄부터 줄 머리의 `)` 줄까지 안의 문자열을 모아 닫힐 때만 낸다(안 닫히면 낸 것이 없다).
 *
 * 복잡도: 줄마다 O(줄 길이)이고 이어 붙이기는 열린 줄 하나당 최대 6줄이므로 전체 O(파일 크기 × 7) 이하다.
 * 동작 변경(선언): 길이가 4000자를 넘는 줄(압축 번들 따위)의 import 는 무시한다. 그 밖에 줄 사이 `\s+` 가 개행을 넘던 형식은
 * 위의 열린 문장만 이어 붙이므로(예: `import\n"x"` 는 되고 `use\n a::b;` 는 안 된다) 한 줄에 쓰는 일반 형식은 모두 그대로 잡힌다.
 */
export const maxImportLineChars = 4000;
const maxJoinLines = 6;

export type ImportRule = {
  /** 한 줄에서 지정자를 뽑는다(`g` 플래그, 첫 캡처가 지정자). */
  line: RegExp;
  /** 줄 끝이 열린 문장이면 맞는 정규식(맞은 위치부터가 이어 붙일 문장의 시작이다). */
  open?: RegExp;
  /** 열린 문장 + 다음 줄들을 합친 문자열의 머리부터 맞춰 보는 정규식(첫 캡처가 지정자). */
  joined?: RegExp;
};

export type ImportBlock = { start: RegExp; end: RegExp; item: RegExp };

/** 규칙마다 파일 순서로 모은 뒤 규칙 순서대로 잇는다(기존 정규식 묶음의 출력 순서와 같다). 블록 결과가 마지막이다. */
export function scanImports(text: string, rules: ImportRule[], block?: ImportBlock): string[] {
  const buckets: string[][] = rules.map(() => []);
  const blockFound: string[] = [];
  let pending: string[] | null = null;
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (line.length > maxImportLineChars) continue;

    if (block !== undefined) {
      if (pending !== null) {
        if (block.end.test(line)) {
          blockFound.push(...pending);
          pending = null;
        } else pending.push(...itemsOf(block.item, line));
      } else {
        const start = block.start.exec(line);
        if (start !== null) pending = itemsOf(block.item, line.slice(start[0].length));
      }
    }

    for (const [ruleIndex, rule] of rules.entries()) {
      const bucket = buckets[ruleIndex] as string[];
      for (const match of line.matchAll(rule.line)) bucket.push(match[1] as string);
      if (rule.open === undefined || rule.joined === undefined) continue;
      const opened = rule.open.exec(line);
      if (opened === null) continue;
      let joined = line.slice(opened.index);
      for (let next = index + 1; next < lines.length && next <= index + maxJoinLines; next += 1) {
        const more = lines[next] as string;
        if (more.length > maxImportLineChars) break;
        joined += `\n${more}`;
        const hit = rule.joined.exec(joined);
        if (hit !== null) {
          bucket.push(hit[1] as string);
          break;
        }
      }
    }
  }
  return [...buckets.flat(), ...blockFound];
}

function itemsOf(item: RegExp, text: string): string[] {
  return Array.from(text.matchAll(item), (match) => match[1] as string);
}
