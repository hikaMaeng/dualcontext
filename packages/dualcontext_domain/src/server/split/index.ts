/** 부분 질의의 최소 길이. 이보다 짧은 조각은 이웃에 붙인다(너무 짧으면 임베딩이 의미를 못 잡는다). */
const minPartChars = 12;
/** 부분 질의 최대 개수. 넘으면 뒤쪽을 마지막 조각에 합친다(라우팅과 수집 호출 수의 상한). */
const maxParts = 4;

// 문장 끝(. ? ! 뒤 공백)과, 요청·의문 어미 뒤의 쉼표에서 나눈다. 목록의 쉼표(「A, B, C」)는 어미가 아니라 명사 뒤라 나뉘지 않는다.
const sentenceEnd = /(?<=[.?!。？！])\s+/;
const clauseEnd = /(?<=인지|는지|은지|할지|을지|나요|가요|까요|니까|주고|하고|해줘|알려줘|주세요|세요)\s*[,，]\s*/;

/**
 * 복합 질의를 하위 질문으로 나눈다. 여러 분야를 한 번에 묻는 질의는 통째로 임베딩하면 의미가 섞여
 * 한쪽 분야(예: 법령)가 라우팅에서 밀린다(실행 로그 #8: 산업 자료와 휴업수당 기준을 함께 물음).
 * 나눌 곳이 없으면 질의 하나만 담아 돌려준다.
 */
export function splitQuery(query: string): string[] {
  const text = query.replace(/\s+/g, " ").trim();
  const raw = text.split(sentenceEnd).flatMap((sentence) => sentence.split(clauseEnd)).map((part) => part.trim()).filter((part) => part !== "");
  const parts: string[] = [];
  for (const part of raw) {
    // 짧은 조각은 앞 조각에 붙인다(앞이 없으면 다음 조각이 붙여 온다).
    if (parts.length > 0 && (part.length < minPartChars || parts[parts.length - 1].length < minPartChars)) parts[parts.length - 1] = `${parts[parts.length - 1]} ${part}`;
    else parts.push(part);
  }
  while (parts.length > maxParts) parts.splice(parts.length - 2, 2, `${parts[parts.length - 2]} ${parts[parts.length - 1]}`);
  return parts.length > 1 ? parts : [text];
}
