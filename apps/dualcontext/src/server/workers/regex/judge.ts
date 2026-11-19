/** 정규식 작업의 상한: 묶음당 링크 수 · 대상 길이 · 시작을 알린 뒤 허용 시간(ms). */
export const regexLimits = { batch: 50, targetChars: 2048, timeoutMs: 200 } as const;

/**
 * 링크 대상(경로 + 쿼리) 묶음에 포함 · 제외 정규식을 적용한다. 제외가 먼저이고, 포함 패턴이 비어 있으면 포함 조건은 없다.
 * 대상이 2048자를 넘으면 정규식에 넣지 않고 제외한다. 정규식은 묶음 안에서 한 번만 컴파일한다(호출마다 `new RegExp` 하지 않는다).
 * 임의 정규식이라 이 함수는 시간을 보장하지 못한다: 호출자(`cpu.regex` 스레드)가 시한을 걸고 스레드째 끝낸다.
 */
export function judgeTargets(include: string[], exclude: string[], targets: string[]): boolean[] {
  const excluded = exclude.map((pattern) => new RegExp(pattern));
  const included = include.map((pattern) => new RegExp(pattern));
  return targets.map((target) => {
    if (target.length > regexLimits.targetChars) return false;
    if (excluded.some((expression) => expression.test(target))) return false;
    return included.length === 0 || included.some((expression) => expression.test(target));
  });
}
