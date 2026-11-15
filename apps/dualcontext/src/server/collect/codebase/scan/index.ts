import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Limits } from "../model/index.js";
import { isIndexable } from "../symbols/languages.js";

export type ScannedFile = { path: string; text: string };
export type ScanResult = { files: ScannedFile[]; skipped: number; truncated: boolean };

const skipDirs = new Set([".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build", "out", "target", ".venv", "venv", "__pycache__", ".next", ".nuxt", "coverage", ".cache", ".gradle", ".idea", ".vscode", "bower_components", "third_party"]);
/** 비밀이 들어 있기 쉬운 파일은 읽지 않는다(컨텍스트로 새지 않게). */
const secretName = /^(\.env(\..*)?|.*\.(pem|key|p12|pfx|jks|keystore|crt)|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|\.npmrc|\.netrc|\.pypirc|credentials(\.json)?|secrets?\.(json|ya?ml|toml))$/i;

/**
 * 폴더를 훑어 소스 파일 본문을 읽는다. 심볼릭 링크는 파일도 폴더도 따라가지 않고(경로 탈출 방지),
 * 파일 수 · 파일 크기 · 총 바이트 · 시간 상한을 넘으면 거기서 멈춘다(truncated). 읽기만 하고 아무것도 실행하지 않는다.
 */
export async function scanTree(root: string, limits: Limits): Promise<ScanResult> {
  const files: ScannedFile[] = [];
  let skipped = 0;
  let total = 0;
  let truncated = false;
  const stack = [root];
  while (stack.length > 0 && !truncated) {
    const current = stack.pop() as string;
    const entries = (await readdir(current, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? 1 : -1));
    for (const entry of entries) {
      if (Date.now() > limits.deadline) throw new Error("index time limit exceeded");
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) { skipped++; continue; }
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) skipped++;
        else stack.push(full);
        continue;
      }
      if (!entry.isFile() || secretName.test(entry.name) || !isIndexable(entry.name)) { skipped++; continue; }
      const size = (await stat(full)).size;
      if (size > limits.maxFileBytes || size === 0) { skipped++; continue; }
      if (files.length >= limits.maxFiles || total + size > limits.maxTotalBytes) { truncated = true; break; }
      const text = await readFile(full, "utf8");
      if (text.includes("\0")) { skipped++; continue; }
      total += size;
      files.push({ path: path.relative(root, full).split(path.sep).join("/"), text });
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { files, skipped, truncated };
}
