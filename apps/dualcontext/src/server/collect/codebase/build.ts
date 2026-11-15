import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { CodebaseConfig } from "./config/index.js";
import { cloneShallow, type Runner } from "./clone/index.js";
import { buildIndex } from "./graph/index.js";
import { assertRef, assertSubPath, parseRepoUrl, repoLabel, resolveInside, type Lookup } from "./guard/index.js";
import type { CodeIndex, IndexSource, Limits } from "./model/index.js";
import { scanTree } from "./scan/index.js";
import { cacheFolder, cacheKey } from "./store/index.js";

export type BuildDeps = { run?: Runner; resolver?: Lookup };

const maxFileBytes = 200_000;
/** 인덱스 캐시와 데이터베이스 자신의 폴더는 소스로 지정할 수 없다. */
const reservedFolders = new Set(["pgdata", cacheFolder]);

/** 같은 출처 · 같은 범위는 같은 키(= 같은 인덱스). 인덱스 한도 설정은 키에 넣지 않는다: 바꾸면 다음 갱신 때 반영된다. */
export function keyOf(config: CodebaseConfig): string {
  return cacheKey(
    config.source === "git"
      ? { source: "git", url: repoLabel(parseRepoUrl(config.url)), ref: config.ref ?? "", subPath: assertSubPath(config.subPath) }
      : { source: "directory", path: config.path ?? "" }
  );
}

/** 볼륨 안 폴더인지 실제 경로로 확인한다(.. · 절대 경로 · 심볼릭 링크 탈출 거부, pgdata · 인덱스 캐시 거부). */
export async function resolveDirectory(dataDir: string, relative: string): Promise<string> {
  if (path.isAbsolute(relative)) throw new Error("directory must be inside the volume");
  const first = path.normalize(relative).split(path.sep)[0] ?? "";
  if (first === ".." || first === "." || first === "") throw new Error("directory must be inside the volume");
  if (reservedFolders.has(first)) throw new Error(`${first} is not a source folder`);
  return resolveInside(dataDir, path.normalize(relative));
}

/** 출처를 읽어(git 이면 클론하고) 구조 인덱스를 만든다. 임시 작업 폴더는 성공이든 실패든 지운다. */
export async function buildFor(dataDir: string, config: CodebaseConfig, deps: BuildDeps = {}): Promise<CodeIndex> {
  const started = Date.now();
  const limits: Limits = { maxFiles: config.maxFiles, maxFileBytes, maxTotalBytes: config.maxRepoMB * 1024 * 1024, deadline: started + config.maxIndexSeconds * 1000 };

  if (config.source === "directory") {
    const root = await resolveDirectory(dataDir, config.path ?? "");
    const source: IndexSource = { kind: "directory", label: config.path ?? "" };
    return buildIndex(await scanTree(root, limits), source);
  }

  const url = parseRepoUrl(config.url);
  const subPath = assertSubPath(config.subPath);
  const ref = config.ref === undefined ? undefined : assertRef(config.ref);
  const work = path.join(dataDir, cacheFolder, `${keyOf(config)}.work-${randomUUID()}`);
  try {
    const { commit } = await cloneShallow(
      { url, ref, destination: work, tokenEnv: config.tokenEnv, timeoutMs: config.maxIndexSeconds * 1000, maxBytes: limits.maxTotalBytes * 2 },
      deps
    );
    const root = await resolveInside(work, subPath);
    const source: IndexSource = { kind: "git", label: repoLabel(url), ref, subPath: subPath === "" ? undefined : subPath, commit: commit === "" ? undefined : commit };
    return buildIndex(await scanTree(root, limits), source);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
