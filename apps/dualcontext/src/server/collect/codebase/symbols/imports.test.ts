import assert from "node:assert/strict";
import test from "node:test";
import { languageOf } from "./languages.js";

const importsOf = (file: string, text: string): string[] => (languageOf(file)?.imports as (text: string) => string[])(text);

const all = (re: RegExp, text: string): string[] => Array.from(text.matchAll(re), (match) => match[1] as string);

/** 교체 전 구현(파일 전체 정규식). 의미 기준으로만 남긴 시험용 사본이다. */
const legacy: Record<string, (text: string) => string[]> = {
  "x.ts": (text) => [
    ...all(/\bfrom\s+['"]([^'"\n]+)['"]/g, text),
    ...all(/\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g, text),
    ...all(/^\s*import\s+['"]([^'"\n]+)['"]/gm, text),
    ...all(/\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g, text)
  ],
  "x.py": (text) => [...all(/^\s*from\s+([.\w]+)\s+import/gm, text), ...all(/^\s*import\s+([\w.]+)/gm, text)],
  "x.go": (text) => {
    const found = all(/^\s*import\s+(?:\w+\s+)?"([^"\n]+)"/gm, text);
    for (const block of text.matchAll(/^import\s*\(([\s\S]*?)^\)/gm)) found.push(...all(/"([^"\n]+)"/g, block[1] as string));
    return found;
  },
  "x.java": (text) => all(/^\s*import\s+(?:static\s+)?([\w.]+)/gm, text),
  "x.rs": (text) => all(/^\s*(?:pub\s+)?use\s+([\w:]+)/gm, text),
  "x.c": (text) => all(/^\s*#\s*include\s+"([^"\n]+)"/gm, text),
  "x.rb": (text) => [...all(/^\s*require_relative\s+['"]([^'"\n]+)['"]/gm, text).map((spec) => `./${spec}`), ...all(/^\s*require\s+['"]([^'"\n]+)['"]/gm, text)],
  "x.php": (text) => all(/^\s*use\s+([\w\\]+)/gm, text).map((spec) => spec.replace(/\\/g, ".")),
  "x.swift": (text) => all(/^\s*import\s+(\w+)/gm, text),
  "x.cs": (text) => all(/^\s*using\s+(?:static\s+)?([\w.]+)\s*;/gm, text)
};

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const vocabulary: Record<string, string[]> = {
  "x.ts": [
    `import { a } from "./a.js";`, `import b from './b'`, `import "./side";`, `import   "./spaced"`, `const c = require("./c");`, `const d = require(`, `  "./multi"`, `)`,
    `const e = await import("./dyn");`, `import(`, `  './dyn2'`, `import {`, `  one,`, `  two`, `} from "./many";`, `} from`, `  "./below"`, `export * from "./star";`,
    `import`, `  "./bare"`, `require( "./inline"`, `  )`, ``, ``, `   `, `function f() { return 1; }`, `// from "./commented"`, `const x = 5;`, `export { y } from '../up'`, `import x from "pkg";`
  ],
  "x.py": ["import os", "import a.b.c", "from . import x", "from ..pkg.mod import (", "    one,", "    two", ")", "from x.y import z", "  import indented", "", "def f():", "    return 1", "from broken import"],
  "x.go": ['import "fmt"', 'import alias "net/http"', "import (", '\t"os"', '\talias "pkg/x"', ")", "func main() {}", "", 'import ("a")', "import (", ")", "  import  \"spaced\""],
  "x.java": ["import java.util.List;", "import static org.x.Y.z;", "package a.b;", "", "  import indented.Foo;"],
  "x.rs": ["use std::io;", "pub use crate::a::b;", "use a::{", "    b,", "};", "mod m;", "", "  use indented::x;"],
  "x.c": ['#include "a.h"', "#include <stdio.h>", '# include "spaced.h"', "int main() {}", ""],
  "x.rb": ["require 'json'", "require_relative 'lib/a'", 'require "x"', "", "  require_relative 'b'"],
  "x.php": ["use App\\Models\\User;", "use Foo;", "namespace A;", ""],
  "x.swift": ["import UIKit", "import Foundation", "", "  import X"],
  "x.cs": ["using System;", "using static A.B;", "using var x = y;", ""]
};

test("import 추출: 무작위로 이어 붙인 파일에서 교체 전 정규식 구현과 결과가 같다(언어별)", () => {
  const next = random(1119);
  let compared = 0;
  for (const [file, lines] of Object.entries(vocabulary)) {
    const reference = legacy[file] as (text: string) => string[];
    for (let round = 0; round < 1500; round += 1) {
      const count = 1 + Math.floor(next() * 14);
      const separator = next() < 0.2 ? "\r\n" : "\n";
      const text = Array.from({ length: count }, () => lines[Math.floor(next() * lines.length)]).join(separator);
      assert.deepEqual(importsOf(file, text), reference(text), `${file}\n${JSON.stringify(text)}`);
      compared += 1;
    }
  }
  assert.equal(compared, 1500 * Object.keys(vocabulary).length);
});

test("import 추출: 여러 줄 형식을 놓치지 않는다(require ( … ), 다중 줄 import, 줄 끝 from, Go import 블록)", () => {
  assert.deepEqual(importsOf("a.ts", `const x = require(\n  "./dep"\n)\n`), ["./dep"]);
  assert.deepEqual(importsOf("a.ts", `const x = require(\n\n  "./blank"\n\n)\n`), ["./blank"]);
  assert.deepEqual(importsOf("a.ts", `import {\n  a,\n  b\n} from "./many.js";\n`), ["./many.js"]);
  assert.deepEqual(importsOf("a.ts", `import { a } from\n  "./below";\n`), ["./below"]);
  assert.deepEqual(importsOf("a.ts", `const m = await import(\n  "./lazy"\n);\n`), ["./lazy"]);
  assert.deepEqual(importsOf("a.go", `package main\n\nimport (\n\t"fmt"\n\tlog "github.com/x/log"\n\t_ "embed"\n)\n\nfunc main() {}\n`), ["fmt", "github.com/x/log", "embed"]);
  assert.deepEqual(importsOf("a.go", `import "os"\nimport (\n  "never/closed"\n`), ["os"], "안 닫힌 블록은 내지 않는다");
  assert.deepEqual(importsOf("a.py", `from . import x\nimport a.b\nfrom pkg import (\n    one,\n    two\n)\n`), [".", "pkg", "a.b"]);
  // 파이썬 `from x` 다음 줄에 `import` 가 오는 형식은 문법 오류라 잡지 않는다(옛 정규식은 `\s+` 가 개행을 넘어 잡았다).
  assert.deepEqual(importsOf("a.py", `from broken\nimport indented\n`), ["indented"]);
});

test("import 추출: 줄 길이 4000자 초과 줄의 import 는 무시한다(선언한 동작 변경), 4000자 이하는 잡는다", () => {
  const pad = (length: number) => `/*${"x".repeat(length)}*/`;
  const ok = `${pad(3000)} import a from "./ok";`;
  const long = `${pad(4100)} import b from "./long";`;
  assert.ok(ok.length <= 4000 && long.length > 4000);
  assert.deepEqual(importsOf("a.ts", `${ok}\n${long}\nimport c from "./after";\n`), ["./ok", "./after"]);
  assert.deepEqual(importsOf("a.ts", `const x = require(\n"${"y".repeat(4100)}"\n)\n`), []);
});

test("import 추출: 빈 줄 · 공백이 수십만 자인 파일과 열린 줄 폭주 입력도 선형 시간에 끝난다(이차 시간 회귀)", () => {
  const blanks = `${"\n".repeat(200_000)}import a from "./a";\n`;
  const opens = `${"require(\n".repeat(20_000)}`;
  const spaces = `${" ".repeat(150_000)}\nimport b from "./b"\n`;
  for (const [file, text] of [["a.ts", blanks], ["a.ts", opens], ["a.ts", spaces], ["a.py", blanks]] as const) {
    const started = performance.now();
    importsOf(file, text);
    assert.ok(performance.now() - started < 1500, `${file} ${(performance.now() - started).toFixed(0)}ms`);
  }
  assert.deepEqual(importsOf("a.ts", blanks), ["./a"]);
});
