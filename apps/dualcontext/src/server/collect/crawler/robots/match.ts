/** 상한: 정규식이 없으므로 시간은 이 값들로 묶인다. 경로 · 패턴 길이를 넘는 입력은 호출자가 먼저 자른다. */
export const robotsLimits = { pathChars: 2048, patternChars: 256, rulesPerGroup: 200 } as const;

/**
 * robots.txt 패턴 하나가 경로에 맞는가(`*` 는 임의 문자열, 끝의 `$` 는 끝 고정, 그 밖은 리터럴).
 * 정규식을 쓰지 않는다: 패턴을 `*` 로 나눈 리터럴 조각을 왼쪽부터 가장 앞 위치에 탐욕 배치한다(`indexOf`).
 * 글롭의 존재 판정에서는 가장 앞에 놓는 것이 뒤에 남는 여지를 최대로 하므로 탐욕 배치가 정확하다.
 * 첫 조각은 접두 일치, `$` 패턴의 마지막 조각은 접미 일치다.
 *
 * 복잡도: 조각마다 `indexOf` 한 번이 경로를 한 번 훑으므로 O(조각 수 × 경로) 이하, 즉 O(경로 × 패턴 길이)다. 선형이 아니다.
 * 입력 상한(경로 2048자 · 패턴 256자)이 최악을 약 수십만 문자 비교로 묶는다.
 */
export function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const parts = (anchored ? pattern.slice(0, -1) : pattern).split("*");
  const first = parts[0] as string;
  if (!path.startsWith(first)) return false;
  if (parts.length === 1) return !anchored || path.length === first.length;
  let position = first.length;
  const last = parts.length - 1;
  for (let index = 1; index < last; index += 1) {
    const found = path.indexOf(parts[index] as string, position);
    if (found < 0) return false;
    position = found + (parts[index] as string).length;
  }
  const tail = parts[last] as string;
  if (anchored) return path.length - tail.length >= position && path.endsWith(tail);
  return path.indexOf(tail, position) >= 0;
}
