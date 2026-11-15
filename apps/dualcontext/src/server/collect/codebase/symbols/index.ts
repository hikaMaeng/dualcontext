import type { SymbolKind } from "../model/index.js";
import type { Language } from "./languages.js";

/** body 는 호출 관계를 뽑는 데만 쓰고 인덱스에는 저장하지 않는다(snippet 만 저장). */
export type RawSymbol = { name: string; kind: SymbolKind; line: number; endLine: number; snippet: string; body: string };
const maxBodyChars = 6000;

/** 제어문 · 키워드가 메서드 이름으로 잘못 잡히는 것을 막는다. */
const notNames = new Set(["if", "for", "while", "switch", "catch", "return", "else", "function", "constructor", "super", "new", "do", "try", "sizeof", "defined", "elif", "with", "match", "when", "await", "typeof"]);
const maxSnippetLines = 40;
const maxSnippetChars = 1600;
const docHeadChars = 1500;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * 심볼의 끝 줄: 시작보다 들여쓰기가 같거나 얕은 다음 비어 있지 않은 줄 직전(닫는 중괄호 줄은 포함).
 * 파서 없이 정규식으로 하는 근사이며, 포맷이 흐트러진 파일에서는 상한(40줄)에서 잘린다.
 */
function endOf(lines: string[], start: number): number {
  const base = indentOf(lines[start] as string);
  const limit = Math.min(lines.length - 1, start + maxSnippetLines - 1);
  for (let index = start + 1; index <= limit; index++) {
    const line = lines[index] as string;
    if (line.trim() === "") continue;
    if (indentOf(line) <= base) return /^\s*[}\])]/.test(line) ? index : index - 1;
  }
  return limit;
}

/** 한 파일에서 정의(심볼)를 뽑는다. 문서 파일은 앞부분 전체를 한 항목(doc)으로 만든다. */
export function extractSymbols(language: Language, path: string, text: string): RawSymbol[] {
  const lines = text.split(/\r?\n/);
  if (language.name === "doc") {
    const head = text.slice(0, docHeadChars);
    return [{ name: path.split("/").pop() as string, kind: "doc", line: 1, endLine: Math.min(lines.length, head.split("\n").length), snippet: head, body: "" }];
  }
  const found: RawSymbol[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as string;
    if (line.length > 400) continue; // 압축된 번들 한 줄
    for (const pattern of language.patterns) {
      const name = pattern.re.exec(line)?.[1];
      if (name === undefined || notNames.has(name)) continue;
      const end = endOf(lines, index);
      let kind = pattern.kind;
      if (kind === "function" && language.name === "python" && indentOf(line) > 0) kind = "method";
      const body = lines.slice(index, end + 1).join("\n");
      found.push({ name, kind, line: index + 1, endLine: end + 1, snippet: body.slice(0, maxSnippetChars), body: body.slice(0, maxBodyChars) });
      break;
    }
  }
  return found;
}
