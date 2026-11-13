/**
 * 자료 본문을 길이 한도에서 문장 경계로 자른다. 한도 바로 앞에서 자르면 문장이 중간에 끊겨(예: "The cast is necessary because all of the opera")
 * 모델이 끊긴 부분을 사실로 오해한다. 한도의 60% 이후에 문장 끝이 있으면 거기서 자르고, 없으면 한도에서 자른다.
 * 잘렸다는 사실은 표시한다.
 */
export function excerpt(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const floor = Math.floor(limit * 0.6);
  let cut = -1;
  for (const match of head.matchAll(/[.!?。]\s|\n/g)) if (match.index !== undefined && match.index >= floor) cut = match.index + 1;
  return `${(cut > 0 ? head.slice(0, cut) : head).trimEnd()} …(이하 생략)`;
}
