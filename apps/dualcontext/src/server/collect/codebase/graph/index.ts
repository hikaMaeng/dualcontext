import type { CodeIndex, FileNode, IndexSource, SymbolNode } from "../model/index.js";
import type { ScanResult } from "../scan/index.js";
import { extractSymbols } from "../symbols/index.js";
import { languageOf } from "../symbols/languages.js";
import { resolveImport, stemIndex } from "./imports.js";

/** 흔한 이름은 호출 관계 후보에서 뺀다: 너무 짧거나 정의가 여러 곳이면 어느 쪽을 부르는지 알 수 없다. */
const minCallName = 3;
const maxDefinitions = 3;
const maxCallsPerSymbol = 30;

/**
 * 스캔 결과로 구조 인덱스를 만든다: 파일 → 심볼(정의), 심볼 → 심볼(이름 호출), 파일 → 파일(import).
 * 호출 관계는 본문에서 `이름(` 꼴을 찾아 레포 안에 정의된 이름과 맞추는 정규식 근사다(타입 해석 없음).
 */
export function buildIndex(scan: ScanResult, source: IndexSource, now: Date = new Date()): CodeIndex {
  const paths = new Set(scan.files.map((file) => file.path));
  const indexOf = new Map(scan.files.map((file, index) => [file.path, index] as const));
  const stems = stemIndex(scan.files.map((file) => file.path));
  const files: FileNode[] = [];
  const symbols: SymbolNode[] = [];
  const bodies: string[] = [];
  let importEdges = 0;

  scan.files.forEach((file, fileIndex) => {
    const language = languageOf(file.path);
    if (language === undefined) return;
    const targets = new Set<number>();
    for (const spec of language.imports(file.text)) {
      for (const target of resolveImport(file.path, spec, paths, stems)) {
        const index = indexOf.get(target);
        if (index !== undefined && index !== fileIndex) targets.add(index);
      }
    }
    importEdges += targets.size;
    files.push({ path: file.path, language: language.name, lines: file.text.split("\n").length, imports: [...targets] });
    for (const raw of extractSymbols(language, file.path, file.text)) {
      symbols.push({ id: symbols.length, file: fileIndex, name: raw.name, kind: raw.kind, line: raw.line, endLine: raw.endLine, snippet: raw.snippet, calls: [], calledBy: [] });
      bodies.push(raw.body);
    }
  });

  const definitions = new Map<string, number[]>();
  for (const symbol of symbols) {
    if (symbol.kind === "doc" || symbol.name.length < minCallName) continue;
    definitions.set(symbol.name, [...(definitions.get(symbol.name) ?? []), symbol.id]);
  }
  let callEdges = 0;
  for (const symbol of symbols) {
    const body = bodies[symbol.id] as string;
    if (body === "") continue;
    const firstNewline = body.indexOf("\n");
    const seen = new Set<number>();
    for (const match of (firstNewline < 0 ? "" : body.slice(firstNewline)).matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
      const targets = definitions.get(match[1] as string);
      if (targets === undefined || targets.length > maxDefinitions) continue;
      for (const target of targets) {
        if (target !== symbol.id) seen.add(target);
      }
      if (seen.size >= maxCallsPerSymbol) break;
    }
    symbol.calls = [...seen];
    callEdges += seen.size;
    for (const target of seen) (symbols[target] as SymbolNode).calledBy.push(symbol.id);
  }

  return {
    version: 1,
    builtAt: now.toISOString(),
    source,
    stats: { files: files.length, symbols: symbols.length, callEdges, importEdges, skippedFiles: scan.skipped, truncated: scan.truncated },
    files,
    symbols
  };
}
