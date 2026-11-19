import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CodeIndex } from "../model/index.js";

/** 볼륨 안 인덱스 캐시 폴더 이름. 폴더 조사원 · 데이터베이스 폴더와 겹치지 않는다. */
export const cacheFolder = "codebase";
/** 인덱스 파일 크기 상한. 쓰기뿐 아니라 읽기 경로에도 적용한다(이보다 큰 파일은 읽지 않고 없는 것으로 본다). */
export const maxIndexBytes = 64 * 1024 * 1024;

/** 같은 출처 설정이면 같은 키: 토큰 환경 변수 이름은 키에 넣지 않는다(인증은 결과 내용을 바꾸지 않는다). */
export function cacheKey(identity: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(Object.entries(identity).sort())).digest("hex").slice(0, 16);
}

export function indexPath(dataDir: string, key: string): string {
  return path.join(dataDir, cacheFolder, key, "index.json");
}

/** 인덱스 파일의 무효화 세대: `mtimeMs:size:ino`. 파일을 읽지 않고 `stat` 만으로 안다. 파일이 없으면 null. */
export async function indexGeneration(file: string): Promise<{ generation: string; size: number } | null> {
  try {
    const info = await stat(file);
    return { generation: `${info.mtimeMs}:${info.size}:${info.ino}`, size: info.size };
  } catch {
    return null;
  }
}

/** 이 키의 인덱스가 디스크에 있는가(파싱하지 않는다, `stat` 만). */
export async function indexExists(dataDir: string, key: string): Promise<boolean> {
  return (await indexGeneration(indexPath(dataDir, key))) !== null;
}

/** 읽은 JSON 이 인덱스 형식인지. 아니면 null(다시 만든다). */
export function parseIndex(json: string): CodeIndex | null {
  try {
    const parsed = JSON.parse(json) as CodeIndex;
    return parsed.version === 1 && Array.isArray(parsed.symbols) && Array.isArray(parsed.files) ? parsed : null;
  } catch {
    return null;
  }
}

/** 인덱스를 읽는다. 없거나 깨졌거나 형식(version)이 다르거나 64MB 를 넘으면 null(다시 만든다). 서버 경로는 이 함수가 아니라 검색 스레드가 읽는다. */
export async function readIndex(dataDir: string, key: string): Promise<CodeIndex | null> {
  const file = indexPath(dataDir, key);
  const info = await indexGeneration(file);
  if (info === null || info.size > maxIndexBytes) return null;
  try {
    return parseIndex(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * 임시 파일에 쓰고 이름을 바꿔 넣는다: 읽는 쪽은 옛 인덱스나 새 인덱스만 본다. 상한(64MB)을 넘으면 저장하지 않는다.
 * 임시 파일 이름은 작업 id(`tag`)로 나눈다: 같은 키를 동시에 쓰는 두 작업이 서로의 임시 파일을 밟지 않고, 부모가 `tag` 로 찾아 지운다.
 */
export async function writeIndex(dataDir: string, key: string, index: CodeIndex, tag: string = String(process.pid)): Promise<void> {
  const target = indexPath(dataDir, key);
  const json = JSON.stringify(index);
  if (Buffer.byteLength(json) > maxIndexBytes) throw new Error("index is larger than the size limit; narrow the sub path");
  await mkdir(path.dirname(target), { recursive: true });
  const temp = tempIndexPath(dataDir, key, tag);
  try {
    await writeFile(temp, json, "utf8");
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}

export function tempIndexPath(dataDir: string, key: string, tag: string): string {
  return `${indexPath(dataDir, key)}.${tag}.tmp`;
}

/** refreshHours 가 0 이면 자동 갱신하지 않는다(처음 한 번만 만든다). */
export function isStale(index: { builtAt: string }, refreshHours: number, now: number = Date.now()): boolean {
  return refreshHours > 0 && now - Date.parse(index.builtAt) > refreshHours * 3_600_000;
}
