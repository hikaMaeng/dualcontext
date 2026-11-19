import type { SymbolKind } from "../model/index.js";
import { scanImports, type ImportBlock, type ImportRule } from "./imports.js";

export type Pattern = { kind: SymbolKind; re: RegExp };
export type Language = {
  name: string;
  exts: string[];
  /** 한 줄에서 정의를 찾는 정규식. 첫 캡처 그룹이 이름이다. */
  patterns: Pattern[];
  /** 파일에서 import 대상(지정자)을 뽑는다. 줄 단위 스캔이며 줄 길이 상한(4000자)이 있다(imports.ts). */
  imports: (text: string) => string[];
};

/** 한 줄 형식만 있는 언어의 규칙: 정규식마다 한 줄에 맞춰 본다. */
const lineRules = (...patterns: RegExp[]): ImportRule[] => patterns.map((line) => ({ line }));
const modifiers = "(?:(?:public|private|protected|internal|static|final|abstract|sealed|open|data|partial|override|virtual|async|export|default|pub|unsafe|const|readonly|inline|extern)\\s+)*";

/**
 * JS/TS import 지정자 규칙(순서가 출력 순서): `from "x"`, `require("x")`, `import "x"`, `import("x")`.
 * 줄 끝에서 열린 `from` · `require(` · `import(` · 홀로 선 `import` 는 다음 줄(최대 6줄)과 이어 붙여 확인한다.
 */
const jsImportRules: ImportRule[] = [
  { line: /\bfrom\s+['"]([^'"\n]+)['"]/g, open: /\bfrom\s*$/, joined: /^from\s+['"]([^'"\n]+)['"]/ },
  { line: /\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g, open: /\brequire\(\s*(?:['"][^'"\n]*['"]\s*)?$/, joined: /^require\(\s*['"]([^'"\n]+)['"]\s*\)/ },
  { line: /^\s*import\s+['"]([^'"\n]+)['"]/g, open: /^\s*import\s*$/, joined: /^\s*import\s+['"]([^'"\n]+)['"]/ },
  { line: /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g, open: /\bimport\(\s*(?:['"][^'"\n]*['"]\s*)?$/, joined: /^import\(\s*['"]([^'"\n]+)['"]\s*\)/ }
];

const jsId = "[A-Za-z_$][\\w$]*";
const js: Language = {
  name: "typescript",
  exts: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
  patterns: [
    { kind: "function", re: new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s*\\*?\\s*(${jsId})`) },
    { kind: "class", re: new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?class\\s+(${jsId})`) },
    { kind: "interface", re: new RegExp(`^\\s*(?:export\\s+)?interface\\s+(${jsId})`) },
    { kind: "type", re: new RegExp(`^\\s*(?:export\\s+)?type\\s+(${jsId})\\s*[=<]`) },
    { kind: "enum", re: new RegExp(`^\\s*(?:export\\s+)?(?:const\\s+)?enum\\s+(${jsId})`) },
    { kind: "function", re: new RegExp(`^\\s*(?:export\\s+)?const\\s+(${jsId})\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:\\([^)]*\\)|${jsId})\\s*(?::[^=]+)?=>`) },
    { kind: "method", re: new RegExp(`^\\s{2,}(?:(?:public|private|protected|static|async|readonly|override)\\s+)*(${jsId})\\s*(?:<[^>]*>)?\\([^)]*\\)\\s*(?::[^{]+)?\\{\\s*$`) }
  ],
  imports: (text) => scanImports(text, jsImportRules)
};

const python: Language = {
  name: "python",
  exts: [".py", ".pyi"],
  patterns: [
    { kind: "function", re: /^\s*(?:async\s+)?def\s+(\w+)/ },
    { kind: "class", re: /^\s*class\s+(\w+)/ }
  ],
  imports: (text) => scanImports(text, lineRules(/^\s*from\s+([.\w]+)\s+import/g, /^\s*import\s+([\w.]+)/g))
};

/** Go `import ( … )`: 줄 머리의 `import (` 부터 줄 머리의 `)` 까지 안의 문자열 전부(안 닫히면 없음). */
const goImportBlock: ImportBlock = { start: /^import\s*\(/, end: /^\)/, item: /"([^"\n]+)"/g };

const go: Language = {
  name: "go",
  exts: [".go"],
  patterns: [
    { kind: "function", re: /^func\s+(?:\([^)]*\)\s*)?(\w+)/ },
    { kind: "struct", re: /^type\s+(\w+)\s+struct\b/ },
    { kind: "interface", re: /^type\s+(\w+)\s+interface\b/ },
    { kind: "type", re: /^type\s+(\w+)\s+[^\s=({]/ }
  ],
  imports: (text) => scanImports(text, lineRules(/^\s*import\s+(?:\w+\s+)?"([^"\n]+)"/g), goImportBlock)
};

const jvmTypes = `^\\s*${modifiers}(?:class|interface|enum|record|object|trait)\\s+(\\w+)`;
const java: Language = {
  name: "java",
  exts: [".java"],
  patterns: [
    { kind: "class", re: new RegExp(jvmTypes) },
    { kind: "method", re: /^\s+(?:(?:public|private|protected|static|final|abstract|synchronized|default)\s+)+[\w<>[\],.? ]+\s+(\w+)\s*\([^;]*$/ }
  ],
  imports: (text) => scanImports(text, lineRules(/^\s*import\s+(?:static\s+)?([\w.]+)/g))
};
const kotlin: Language = {
  name: "kotlin",
  exts: [".kt", ".kts", ".scala"],
  patterns: [
    { kind: "class", re: new RegExp(jvmTypes) },
    { kind: "function", re: /^\s*(?:(?:public|private|protected|internal|override|open|suspend|inline|abstract)\s+)*(?:fun|def)\s+(?:<[^>]+>\s*)?(?:[\w.]+\.)?(\w+)\s*[(\[]/ }
  ],
  imports: (text) => scanImports(text, lineRules(/^\s*import\s+([\w.]+)/g))
};
const csharp: Language = {
  name: "csharp",
  exts: [".cs"],
  patterns: [
    { kind: "class", re: new RegExp(`^\\s*${modifiers}(?:class|interface|enum|struct|record)\\s+(\\w+)`) },
    { kind: "method", re: /^\s+(?:(?:public|private|protected|internal|static|virtual|override|abstract|async|sealed)\s+)+[\w<>[\],.? ]+\s+(\w+)\s*\([^;]*$/ }
  ],
  imports: (text) => scanImports(text, lineRules(/^\s*using\s+(?:static\s+)?([\w.]+)\s*;/g))
};

const rust: Language = {
  name: "rust",
  exts: [".rs"],
  patterns: [
    { kind: "function", re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:const\s+)?fn\s+(\w+)/ },
    { kind: "struct", re: /^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+(\w+)/ },
    { kind: "enum", re: /^\s*(?:pub(?:\([^)]*\))?\s+)?enum\s+(\w+)/ },
    { kind: "trait", re: /^\s*(?:pub(?:\([^)]*\))?\s+)?trait\s+(\w+)/ },
    { kind: "module", re: /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)/ }
  ],
  imports: (text) => scanImports(text, lineRules(/^\s*(?:pub\s+)?use\s+([\w:]+)/g))
};

const c: Language = {
  name: "c",
  exts: [".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh"],
  patterns: [
    { kind: "struct", re: /^\s*(?:typedef\s+)?(?:struct|class|union)\s+(\w+)\s*(?:[:{]|$)/ },
    { kind: "enum", re: /^\s*(?:typedef\s+)?enum\s+(?:class\s+)?(\w+)\s*(?:[:{]|$)/ },
    { kind: "function", re: /^[A-Za-z_][\w\s*&:<>,~]*?[\s*&]+(?:\w+::)*(~?\w+)\s*\([^;]*\)\s*(?:const\s*)?(?:noexcept\s*)?\{?\s*$/ }
  ],
  imports: (text) => scanImports(text, lineRules(/^\s*#\s*include\s+"([^"\n]+)"/g))
};

const ruby: Language = {
  name: "ruby",
  exts: [".rb"],
  patterns: [
    { kind: "function", re: /^\s*def\s+(?:self\.)?(\w+[?!]?)/ },
    { kind: "class", re: /^\s*class\s+(\w+)/ },
    { kind: "module", re: /^\s*module\s+(\w+)/ }
  ],
  imports: (text) => [
    ...scanImports(text, lineRules(/^\s*require_relative\s+['"]([^'"\n]+)['"]/g)).map((spec) => `./${spec}`),
    ...scanImports(text, lineRules(/^\s*require\s+['"]([^'"\n]+)['"]/g))
  ]
};
const php: Language = {
  name: "php",
  exts: [".php"],
  patterns: [
    { kind: "function", re: /^\s*(?:(?:public|private|protected|static|final|abstract)\s+)*function\s+&?(\w+)/ },
    { kind: "class", re: /^\s*(?:(?:abstract|final)\s+)*(?:class|interface|trait)\s+(\w+)/ }
  ],
  imports: (text) => scanImports(text, lineRules(/^\s*use\s+([\w\\]+)/g)).map((spec) => spec.replace(/\\/g, "."))
};
const swift: Language = {
  name: "swift",
  exts: [".swift"],
  patterns: [
    { kind: "function", re: /^\s*(?:(?:public|private|internal|fileprivate|open|static|override|final|mutating)\s+)*func\s+(\w+)/ },
    { kind: "class", re: /^\s*(?:(?:public|private|internal|fileprivate|open|final)\s+)*(?:class|struct|enum|protocol|actor)\s+(\w+)/ }
  ],
  imports: (text) => scanImports(text, lineRules(/^\s*import\s+(\w+)/g))
};

/** 설명 문서(README 등): 심볼은 없고 파일 앞부분이 검색 대상이 된다. */
const doc: Language = { name: "doc", exts: [".md", ".markdown", ".rst", ".txt"], patterns: [], imports: () => [] };

const languages = [js, python, go, java, kotlin, csharp, rust, c, ruby, php, swift, doc];
const byExt = new Map(languages.flatMap((language) => language.exts.map((ext) => [ext, language] as const)));

/** 파일 이름으로 언어를 정한다. 지원하지 않는 확장자는 undefined. */
export function languageOf(fileName: string): Language | undefined {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? undefined : byExt.get(fileName.slice(dot).toLowerCase());
}

export function isIndexable(fileName: string): boolean {
  return languageOf(fileName) !== undefined;
}
