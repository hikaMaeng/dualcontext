import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { BuildOutcome, BuildPool, BuildPriority } from "../../workers/build/index.js";
import { buildPool } from "../../workers/build/index.js";
import type { SearchPool } from "../../workers/search/index.js";
import type { CodebaseConfig } from "./config/index.js";
import { cloneShallow, type Runner } from "./clone/index.js";
import { assertRef, assertSubPath, parseRepoUrl, repoLabel, resolveInside, type Lookup } from "./guard/index.js";
import type { IndexSource, Limits } from "./model/index.js";
import { cacheFolder, cacheKey, tempIndexPath } from "./store/index.js";

/**
 * 코드베이스 수집의 주입 · 호출 옵션. `signal` 은 **요청**(실행)의 신호다: 요청의 기다림과 검색에만 쓰이고, 공유 작업(색인 빌드 · 클론)은
 * 자기 신호를 따로 쓴다(요청이 취소돼도 다른 요청이 기다리는 빌드는 계속된다).
 */
export type BuildDeps = { run?: Runner; resolver?: Lookup; signal?: AbortSignal; buildPool?: BuildPool; searchPool?: SearchPool };
/** 공유 빌드 작업 자신의 옵션. */
export type BuildJobOptions = { signal?: AbortSignal; priority?: BuildPriority; jobId?: string };

const maxFileBytes = 200_000;
/** 인덱스 캐시와 데이터베이스 자신의 폴더는 소스로 지정할 수 없다. */
const reservedFolders = new Set(["pgdata", cacheFolder]);
/** 스캔 시한(`maxIndexSeconds`) 뒤 심볼 · 그래프 · 쓰기에 더 주는 여유. 이 시간이 지나면 빌드 스레드를 끝낸다. */
const hardTimeoutGraceMs = 30_000;

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

/**
 * 출처를 읽어(git 이면 메인에서 `spawn` 으로 클론하고) 빌드 스레드에 스캔 · 심볼 · 그래프 · 인덱스 쓰기를 맡긴다.
 * 인덱스는 스레드가 파일로 쓰고 메인은 요약만 받는다. 임시 작업 폴더와 임시 인덱스 파일은 작업 id 로 나뉘고, 빌드 스레드의 종료를
 * 확인한 뒤 부모가 성공이든 실패든 지운다.
 */
export async function buildFor(dataDir: string, config: CodebaseConfig, deps: BuildDeps = {}, job: BuildJobOptions = {}): Promise<BuildOutcome> {
  const started = Date.now();
  const jobId = job.jobId ?? randomUUID();
  const key = keyOf(config);
  const limits: Limits = { maxFiles: config.maxFiles, maxFileBytes, maxTotalBytes: config.maxRepoMB * 1024 * 1024, deadline: started + config.maxIndexSeconds * 1000 };
  const pool = deps.buildPool ?? buildPool();
  const options = { signal: job.signal, priority: job.priority, timeoutMs: config.maxIndexSeconds * 1000 + hardTimeoutGraceMs };
  let work: string | undefined;
  try {
    if (config.source === "directory") {
      const root = await resolveDirectory(dataDir, config.path ?? "");
      const source: IndexSource = { kind: "directory", label: config.path ?? "" };
      return await pool.run({ jobId, root, source, limits, dataDir, key }, options);
    }

    const url = parseRepoUrl(config.url);
    const subPath = assertSubPath(config.subPath);
    const ref = config.ref === undefined ? undefined : assertRef(config.ref);
    work = path.join(dataDir, cacheFolder, `${key}.work-${jobId}`);
    const { commit } = await cloneShallow(
      { url, ref, destination: work, tokenEnv: config.tokenEnv, timeoutMs: config.maxIndexSeconds * 1000, maxBytes: limits.maxTotalBytes * 2, signal: job.signal },
      deps
    );
    const root = await resolveInside(work, subPath);
    const source: IndexSource = { kind: "git", label: repoLabel(url), ref, subPath: subPath === "" ? undefined : subPath, commit: commit === "" ? undefined : commit };
    return await pool.run({ jobId, root, source, limits, dataDir, key }, options);
  } finally {
    if (work !== undefined) await rm(work, { recursive: true, force: true });
    await rm(tempIndexPath(dataDir, key, jobId), { force: true });
  }
}
