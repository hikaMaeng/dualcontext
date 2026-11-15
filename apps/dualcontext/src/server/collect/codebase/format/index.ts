import type { Material } from "dualcontext_domain/common";
import type { CodeIndex, SymbolNode } from "../model/index.js";
import type { Hit } from "../rank/index.js";

const listLimit = 8;

function ref(index: CodeIndex, symbol: SymbolNode): string {
  return `${symbol.name} (${(index.files[symbol.file] as { path: string }).path}:${symbol.line})`;
}

function list(index: CodeIndex, ids: number[]): string {
  const shown = ids.slice(0, listLimit).map((id) => ref(index, index.symbols[id] as SymbolNode));
  return shown.join(", ") + (ids.length > listLimit ? ` … (+${ids.length - listLimit})` : "");
}

/**
 * 검색된 심볼을 자료로 바꾼다. 소스 조각 뒤에 구조 정보(이 심볼이 부르는 것 · 부르는 것 · 같은 파일이 import 하는 파일)를 붙인다.
 * 이 구조 줄이 청크 임베딩과 다른 점이다: 호출자는 정의만 보고는 알 수 없는 영향 범위다.
 */
export function toMaterials(index: CodeIndex, hits: Hit[]): Material[] {
  return hits.map((hit) => {
    const symbol = index.symbols[hit.id] as SymbolNode;
    const file = index.files[symbol.file] as CodeIndex["files"][number];
    const lines = [symbol.snippet];
    if (symbol.calls.length > 0) lines.push(`calls: ${list(index, symbol.calls)}`);
    if (symbol.calledBy.length > 0) lines.push(`called by: ${list(index, symbol.calledBy)}`);
    if (file.imports.length > 0) lines.push(`file imports: ${file.imports.slice(0, listLimit).map((id) => (index.files[id] as { path: string }).path).join(", ")}`);
    if (hit.via !== undefined) lines.push(`related through call graph to: ${ref(index, index.symbols[hit.via] as SymbolNode)}`);
    return { title: `${file.path}:${symbol.line}-${symbol.endLine} ${symbol.kind} ${symbol.name}`, text: lines.join("\n") };
  });
}
