/**
 * 질의 속 식별자 추출. 임베딩은 CVE-2024-21709 같은 식별자나 「GT 330」 같은 모델명을 다른 비슷한 것과 구별하지 못한다
 * (실행 로그 #25: 질의의 CVE 세 건이 모두 자료에 없었다). 그런 표기는 문자열로 직접 찾는다.
 *
 * - literal: 본문/제목에서 그대로 찾을 표기(CVE ID, 영문 모델명+숫자, 영문 약어/하이픈 이름).
 * - ref: 「질문 61」 「#4」처럼 행의 원본 번호를 가리키는 숫자.
 * 흔한 말이 걸리지 않도록 호출하는 쪽에서 일치 행이 너무 많은 literal 은 버린다.
 */
export type QueryIdentifiers = { literals: string[]; refs: string[] };

const cve = /CVE-\d{4}-\d{4,7}/gi;
// 영문 제품명 + 숫자(RTX 5090, HD 6570, GT 330, GeForce 8600). 숫자 앞 공백/하이픈 허용.
const model = /\b[A-Za-z]{2,}[ -]?\d{2,}[A-Za-z0-9]*\b/g;
// 하이픈으로 이어진 영문 이름(Q-Sparse)과 4자 이상 영문 대문자 약어(FLUTE, FUNGI).
const name = /\b[A-Z][A-Za-z]*(?:-[A-Z][A-Za-z]+)+\b|\b[A-Z]{4,}\b/g;
const ref = /(?:질문|번호|글|문서|#)\s*(\d{1,9})(?!\d)/g;
// 모델명 패턴이 잡아도 식별자가 아닌 흔한 표기.
const ignored = new Set(["utf-8", "utf8", "http", "https", "html", "json", "mp3", "mp4", "png", "jpg", "jpeg", "gif", "pdf", "csv", "xml", "sql", "ipv4", "ipv6", "ascii"]);

export function extractIdentifiers(query: string): QueryIdentifiers {
  const literals: string[] = [];
  const add = (value: string) => {
    const text = value.trim();
    if (text.length >= 3 && !ignored.has(text.toLowerCase()) && !literals.some((existing) => existing.toLowerCase() === text.toLowerCase())) literals.push(text);
  };
  for (const found of query.matchAll(cve)) add(found[0].toUpperCase());
  for (const found of query.matchAll(model)) add(found[0]);
  for (const found of query.matchAll(name)) add(found[0]);
  const refs = [...new Set([...query.matchAll(ref)].map((found) => found[1]))];
  return { literals, refs };
}

/** LIKE 패턴의 특수문자를 이스케이프한다(\ 를 이스케이프 문자로 쓴다). */
export const likePattern = (value: string) => `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
