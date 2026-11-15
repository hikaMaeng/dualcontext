import type { SymbolKind } from "../model/index.js";

export type Pattern = { kind: SymbolKind; re: RegExp };
export type Language = {
  name: string;
  exts: string[];
  /** 한 줄에서 정의를 찾는 정규식. 첫 캡처 그룹이 이름이다. */
  patterns: Pattern[];
  /** 파일 전체에서 import 대상(지정자)을 뽑는다. */
  imports: (text: string) => string[];
};

const all = (re: RegExp, text: string): string[] => Array.from(text.matchAll(re), (match) => match[1] as string);
const modifiers = "(?:(?:public|private|protected|internal|static|final|abstract|sealed|open|data|partial|override|virtual|async|export|default|pub|unsafe|const|readonly|inline|extern)\\s+)*";

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
  imports: (text) => [
    ...all(/\bfrom\s+['"]([^'"\n]+)['"]/g, text),
    ...all(/\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g, text),
    ...all(/^\s*import\s+['"]([^'"\n]+)['"]/gm, text),
    ...all(/\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g, text)
  ]
};

const python: Language = {
  name: "python",
  exts: [".py", ".pyi"],
  patterns: [
    { kind: "function", re: /^\s*(?:async\s+)?def\s+(\w+)/ },
    { kind: "class", re: /^\s*class\s+(\w+)/ }
  ],
  imports: (text) => [...all(/^\s*from\s+([.\w]+)\s+import/gm, text), ...all(/^\s*import\s+([\w.]+)/gm, text)]
};

const go: Language = {
  name: "go",
  exts: [".go"],
  patterns: [
    { kind: "function", re: /^func\s+(?:\([^)]*\)\s*)?(\w+)/ },
    { kind: "struct", re: /^type\s+(\w+)\s+struct\b/ },
    { kind: "interface", re: /^type\s+(\w+)\s+interface\b/ },
    { kind: "type", re: /^type\s+(\w+)\s+[^\s=({]/ }
  ],
  imports: (text) => {
    const found = all(/^\s*import\s+(?:\w+\s+)?"([^"\n]+)"/gm, text);
    for (const block of text.matchAll(/^import\s*\(([\s\S]*?)^\)/gm)) found.push(...all(/"([^"\n]+)"/g, block[1] as string));
    return found;
  }
};

const jvmTypes = `^\\s*${modifiers}(?:class|interface|enum|record|object|trait)\\s+(\\w+)`;
const java: Language = {
  name: "java",
  exts: [".java"],
  patterns: [
    { kind: "class", re: new RegExp(jvmTypes) },
    { kind: "method", re: /^\s+(?:(?:public|private|protected|static|final|abstract|synchronized|default)\s+)+[\w<>[\],.? ]+\s+(\w+)\s*\([^;]*$/ }
  ],
  imports: (text) => all(/^\s*import\s+(?:static\s+)?([\w.]+)/gm, text)
};
const kotlin: Language = {
  name: "kotlin",
  exts: [".kt", ".kts", ".scala"],
  patterns: [
    { kind: "class", re: new RegExp(jvmTypes) },
    { kind: "function", re: /^\s*(?:(?:public|private|protected|internal|override|open|suspend|inline|abstract)\s+)*(?:fun|def)\s+(?:<[^>]+>\s*)?(?:[\w.]+\.)?(\w+)\s*[(\[]/ }
  ],
  imports: (text) => all(/^\s*import\s+([\w.]+)/gm, text)
};
const csharp: Language = {
  name: "csharp",
  exts: [".cs"],
  patterns: [
    { kind: "class", re: new RegExp(`^\\s*${modifiers}(?:class|interface|enum|struct|record)\\s+(\\w+)`) },
    { kind: "method", re: /^\s+(?:(?:public|private|protected|internal|static|virtual|override|abstract|async|sealed)\s+)+[\w<>[\],.? ]+\s+(\w+)\s*\([^;]*$/ }
  ],
  imports: (text) => all(/^\s*using\s+(?:static\s+)?([\w.]+)\s*;/gm, text)
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
  imports: (text) => all(/^\s*(?:pub\s+)?use\s+([\w:]+)/gm, text)
};

const c: Language = {
  name: "c",
  exts: [".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh"],
  patterns: [
    { kind: "struct", re: /^\s*(?:typedef\s+)?(?:struct|class|union)\s+(\w+)\s*(?:[:{]|$)/ },
    { kind: "enum", re: /^\s*(?:typedef\s+)?enum\s+(?:class\s+)?(\w+)\s*(?:[:{]|$)/ },
    { kind: "function", re: /^[A-Za-z_][\w\s*&:<>,~]*?[\s*&]+(?:\w+::)*(~?\w+)\s*\([^;]*\)\s*(?:const\s*)?(?:noexcept\s*)?\{?\s*$/ }
  ],
  imports: (text) => all(/^\s*#\s*include\s+"([^"\n]+)"/gm, text)
};

const ruby: Language = {
  name: "ruby",
  exts: [".rb"],
  patterns: [
    { kind: "function", re: /^\s*def\s+(?:self\.)?(\w+[?!]?)/ },
    { kind: "class", re: /^\s*class\s+(\w+)/ },
    { kind: "module", re: /^\s*module\s+(\w+)/ }
  ],
  imports: (text) => [...all(/^\s*require_relative\s+['"]([^'"\n]+)['"]/gm, text).map((spec) => `./${spec}`), ...all(/^\s*require\s+['"]([^'"\n]+)['"]/gm, text)]
};
const php: Language = {
  name: "php",
  exts: [".php"],
  patterns: [
    { kind: "function", re: /^\s*(?:(?:public|private|protected|static|final|abstract)\s+)*function\s+&?(\w+)/ },
    { kind: "class", re: /^\s*(?:(?:abstract|final)\s+)*(?:class|interface|trait)\s+(\w+)/ }
  ],
  imports: (text) => all(/^\s*use\s+([\w\\]+)/gm, text).map((spec) => spec.replace(/\\/g, "."))
};
const swift: Language = {
  name: "swift",
  exts: [".swift"],
  patterns: [
    { kind: "function", re: /^\s*(?:(?:public|private|internal|fileprivate|open|static|override|final|mutating)\s+)*func\s+(\w+)/ },
    { kind: "class", re: /^\s*(?:(?:public|private|internal|fileprivate|open|final)\s+)*(?:class|struct|enum|protocol|actor)\s+(\w+)/ }
  ],
  imports: (text) => all(/^\s*import\s+(\w+)/gm, text)
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
