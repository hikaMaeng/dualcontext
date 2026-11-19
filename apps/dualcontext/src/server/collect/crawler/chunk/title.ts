/** 제목 줄 판정을 하는 줄의 길이 상한. 이보다 긴 줄은 제목이 아니라 본문이다(동작 변경: 옛 정규식은 길이 제한이 없었다). */
export const maxTitleLineChars = 4000;

const isSpace = (char: string) => char.trim() === "";
/** 정규식의 `.` 이 넘지 못하는 줄 끝 문자: \r, U+2028, U+2029(\n 은 줄 나눔에서 이미 빠진다). */
const terminators = new Set(["\r", String.fromCharCode(0x2028), String.fromCharCode(0x2029)]);

/**
 * 마크다운 제목 줄(`#`~`####` + 공백 + 제목 + 선택적 닫는 `#`)에서 제목을 꺼낸다. 아니면 null.
 * 옛 정규식 `^#{1,4}\s+(.+?)\s*#*$` 와 같은 결과를 내되(수상한 경계 포함: `#` 뒤가 공백뿐이면 마지막 공백 한 글자가 제목)
 * 역추적이 없다. 복잡도 O(줄 길이)이고 줄 길이는 4000자로 묶인다.
 */
export function parseTitle(line: string): string | null {
  if (line.length > maxTitleLineChars) return null;
  let hashes = 0;
  while (hashes < line.length && line[hashes] === "#") hashes += 1;
  if (hashes < 1 || hashes > 4) return null;
  let start = hashes;
  while (start < line.length && isSpace(line[start] as string)) start += 1;
  const gap = start - hashes;
  if (gap < 1) return null;
  let title: string;
  if (start === line.length) {
    // 공백뿐: 정규식은 `\s+` 를 한 글자씩 물려 가며 제목 한 글자를 찾는다. 줄 끝 문자는 제목이 될 수 없다.
    let at = start - 1;
    while (at > hashes && terminators.has(line[at] as string)) at -= 1;
    if (at <= hashes) return null;
    title = line[at] as string;
  } else {
    let end = line.length;
    while (end > start && line[end - 1] === "#") end -= 1;
    while (end > start && isSpace(line[end - 1] as string)) end -= 1;
    title = line.slice(start, Math.max(end, start + 1));
  }
  for (const char of title) if (terminators.has(char)) return null;
  return title;
}
