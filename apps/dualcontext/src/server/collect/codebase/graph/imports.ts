import path from "node:path";

const codeExts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".py", ".pyi", ".rb", ".php", ".go", ".rs", ".java", ".kt", ".cs", ".swift", ".c", ".h", ".cc", ".cpp", ".hpp"];
const maxTargets = 5;

function strip(file: string): string {
  const dot = file.lastIndexOf(".");
  return dot > file.lastIndexOf("/") ? file.slice(0, dot) : file;
}

/** import 지정자를 레포 안 파일 경로(들)로 푼다. 풀리지 않으면(외부 패키지 등) 빈 배열. 근사이며 파서 수준 해석은 아니다. */
export function resolveImport(from: string, spec: string, paths: Set<string>, stems: Map<string, string[]>): string[] {
  let spec2 = spec;
  let base: string | undefined;
  if (spec2.startsWith(".")) {
    // 파이썬 상대 import(.foo, ..bar.baz)와 JS 상대 경로(./x, ../y)
    const dots = /^\.+/.exec(spec2)?.[0].length ?? 0;
    if (spec2.startsWith("./") || spec2.startsWith("../")) base = path.posix.join(path.posix.dirname(from), spec2);
    else {
      let dir = path.posix.dirname(from);
      for (let up = 1; up < dots; up++) dir = path.posix.dirname(dir);
      base = path.posix.join(dir, spec2.slice(dots).replace(/\./g, "/"));
    }
    base = path.posix.normalize(base);
    if (base.startsWith("../")) return [];
    const trimmed = strip(base);
    // TS ESM 의 './x.js' 는 실제로 x.ts 를 가리킨다.
    const candidates = [base, trimmed, ...codeExts.map((ext) => trimmed + ext), ...codeExts.map((ext) => `${trimmed}/index${ext}`), `${trimmed}/__init__.py`];
    const hit = candidates.find((candidate) => paths.has(candidate));
    return hit === undefined ? [] : [hit];
  }
  // 외부 패키지 가능성이 큰 한 단어 지정자(react, express, os)는 풀지 않는다. 점 · 슬래시 · :: 가 있는 이름만 접미 경로로 맞춘다.
  spec2 = spec2.replace(/::/g, "/").replace(/\./g, "/");
  if (!spec2.includes("/")) return [];
  const parts = spec2.split("/").filter((part) => part !== "" && part !== "*");
  const last = parts[parts.length - 1];
  if (last === undefined) return [];
  const suffixFull = parts.join("/");
  const suffixDir = parts.slice(-2).join("/");
  const found: string[] = [];
  for (const candidate of stems.get(last) ?? []) {
    if (strip(candidate).endsWith(suffixFull) || strip(candidate).endsWith(`${suffixFull}/index`)) found.push(candidate);
    if (found.length >= maxTargets) break;
  }
  if (found.length === 0) {
    // Go 처럼 import 가 파일이 아니라 패키지 폴더를 가리키는 경우: 폴더 접미가 맞는 파일들.
    for (const candidate of paths) {
      if (path.posix.dirname(candidate).endsWith(suffixDir) && candidate !== from) found.push(candidate);
      if (found.length >= maxTargets) break;
    }
  }
  return found;
}

/** 파일 이름(확장자 뺀 것) → 그 이름의 파일 경로들. 접미 경로 맞춤의 후보 좁히기용. */
export function stemIndex(paths: string[]): Map<string, string[]> {
  const stems = new Map<string, string[]>();
  for (const file of paths) {
    const stem = path.posix.basename(strip(file));
    const keys = stem === "index" || stem === "__init__" || stem === "mod" ? [stem, path.posix.basename(path.posix.dirname(file))] : [stem];
    for (const key of keys) stems.set(key, [...(stems.get(key) ?? []), file]);
  }
  return stems;
}
