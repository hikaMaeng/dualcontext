import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CodeIndex } from "../model/index.js";

/** 볼륨 안 인덱스 캐시 폴더 이름. 폴더 조사원 · 데이터베이스 폴더와 겹치지 않는다. */
export const cacheFolder = "codebase";
const maxIndexBytes = 64 * 1024 * 1024;

/** 같은 출처 설정이면 같은 키: 토큰 환경 변수 이름은 키에 넣지 않는다(인증은 결과 내용을 바꾸지 않는다). */
export function cacheKey(identity: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(Object.entries(identity).sort())).digest("hex").slice(0, 16);
}

export function indexPath(dataDir: string, key: string): string {
  return path.join(dataDir, cacheFolder, key, "index.json");
}

/** 인덱스를 읽는다. 없거나 깨졌거나 형식(version)이 다르면 null(다시 만든다). */
export async function readIndex(dataDir: string, key: string): Promise<CodeIndex | null> {
  try {
    const parsed = JSON.parse(await readFile(indexPath(dataDir, key), "utf8")) as CodeIndex;
    return parsed.version === 1 && Array.isArray(parsed.symbols) && Array.isArray(parsed.files) ? parsed : null;
  } catch {
    return null;
  }
}

/** 임시 파일에 쓰고 이름을 바꿔 넣는다: 읽는 쪽은 옛 인덱스나 새 인덱스만 본다. 상한(64MB)을 넘으면 저장하지 않는다. */
export async function writeIndex(dataDir: string, key: string, index: CodeIndex): Promise<void> {
  const target = indexPath(dataDir, key);
  const json = JSON.stringify(index);
  if (Buffer.byteLength(json) > maxIndexBytes) throw new Error("index is larger than the size limit; narrow the sub path");
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temp, json, "utf8");
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}

/** refreshHours 가 0 이면 자동 갱신하지 않는다(처음 한 번만 만든다). */
export function isStale(index: CodeIndex, refreshHours: number, now: number = Date.now()): boolean {
  return refreshHours > 0 && now - Date.parse(index.builtAt) > refreshHours * 3_600_000;
}
