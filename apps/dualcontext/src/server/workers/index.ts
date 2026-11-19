export { buildPool, createBuildPool, type BuildCallOptions, type BuildJob, type BuildOutcome, type BuildPool, type BuildPriority } from "./build/index.js";
export { readWorkerSettings, type WorkerSettings } from "./config/index.js";
export { shutdownWorkers, taskSnapshot, tasksOf, type TaskInfo } from "./pool/index.js";
export { createRegexPool, regexLimits, regexPool, type RegexPool } from "./regex/index.js";
export { createSearchPool, searchPool, slotOf, type IndexQuery, type SearchOutcome, type SearchPool } from "./search/index.js";

import { buildPool } from "./build/index.js";
import { regexPool } from "./regex/index.js";
import { searchPool } from "./search/index.js";

/** 계측(`/api/admin/status` 용): 세 소비자의 현재 상태. 스레드를 아직 띄우지 않았어도 호출할 수 있다(공용 풀만 만든다). */
export function workerStats() {
  return { search: searchPool().stats(), build: buildPool().stats(), regex: regexPool().stats() };
}
