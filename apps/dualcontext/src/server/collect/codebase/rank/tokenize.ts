const stopWords = new Set(["the", "an", "of", "to", "in", "is", "are", "how", "what", "where", "which", "does", "do", "and", "or", "for", "with", "this", "that", "find", "show", "me", "it", "be", "on", "by", "from", "use", "used", "work", "works", "code", "can", "who", "why", "when", "all"]);

/**
 * 식별자 · 경로 · 문장을 소문자 토큰으로 나눈다. camelCase 와 snake_case 는 조각으로 나누고 붙인 전체도 남긴다
 * (`collectFolder` → collect, folder, collectfolder, `url_for` → url, for, url_for: 밑줄 이름은 전체도 남겨 정확한 이름 일치가 흔한 조각 일치보다 앞선다). 영문 · 숫자 토큰만 쓴다: 한글 질의는 토큰이 없어 코드와 맞지 않는다.
 */
export function tokenize(text: string, dropStopWords = false): string[] {
  const tokens: string[] = [];
  for (const word of text.split(/[^A-Za-z0-9_]+/)) {
    if (word === "") continue;
    const pieces = word.replace(/_+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").toLowerCase().split(" ").filter((piece) => piece !== "");
    for (const piece of pieces) {
      if (piece.length >= 2 && !(dropStopWords && stopWords.has(piece))) tokens.push(piece);
    }
    if (pieces.length > 1) tokens.push(word.toLowerCase().replace(/^_+|_+$/g, ""));
  }
  return tokens;
}
