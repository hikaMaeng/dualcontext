/** 글자 하나의 폭(em). 한글 · 한자 · 가나 · 전각은 1, 나머지는 0.58 로 어림한다(SVG 텍스트는 자동 줄바꿈이 없다). */
function widthOf(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x1100 && (code <= 0x11ff || (code >= 0x2e80 && code <= 0xd7ff) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xffef)) ? 1 : 0.58;
}

/**
 * 이름을 폭 예산(em) 안에서 최대 maxLines 줄로 나눈다. 줄이 넘칠 때 그 줄 뒷절반 안에 공백이 있으면 거기서 바꾸고, 없으면 글자 단위로 자른다.
 * 최대 줄을 채우고도 남으면 마지막 줄을 말줄임표(…)로 끝낸다. 전체 이름은 호출자가 title · aria-label 로 따로 보인다.
 */
export function wrapName(name: string, budget: number, maxLines: number): string[] {
  const chars = [...name.replace(/\s+/g, " ").trim()];
  const lines: string[] = [];
  let start = 0;
  while (start < chars.length && lines.length < maxLines) {
    let used = 0;
    let end = start;
    while (end < chars.length && used + widthOf(chars[end]) <= budget) {
      used += widthOf(chars[end]);
      end += 1;
    }
    if (end === start) end = start + 1;
    if (end < chars.length) {
      let space = -1;
      for (let k = end; k > start; k -= 1) {
        if (chars[k] === " ") {
          space = k;
          break;
        }
      }
      if (space > start + (end - start) / 2) end = space;
    }
    lines.push(chars.slice(start, end).join("").trimEnd());
    start = end;
    while (chars[start] === " ") start += 1;
  }
  if (start < chars.length && lines.length > 0) lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[\s.…]+$/u, "")}…`;
  return lines;
}
