import { parentPort } from "node:worker_threads";
import { buildIndex } from "../../collect/codebase/graph/index.js";
import { scanTree } from "../../collect/codebase/scan/index.js";
import { writeIndex } from "../../collect/codebase/store/index.js";
import { threadData } from "../thread/data.js";
import type { BuildJob, BuildReply } from "./protocol.js";

/** `cpu.build` 스레드 본체: 작업 하나(스캔 · 심볼 · 그래프 · 인덱스 쓰기)를 하고 끝난다. 취소 · 시한은 부모가 스레드를 끝낸다. */
const port = parentPort;
if (port === null) throw new Error("build worker must run in a worker thread");

const job = threadData<BuildJob>();
try {
  const index = buildIndex(await scanTree(job.root, job.limits), job.source);
  await writeIndex(job.dataDir, job.key, index, job.jobId);
  port.postMessage({ type: "done", builtAt: index.builtAt, stats: index.stats } satisfies BuildReply);
} catch (error) {
  port.postMessage({ type: "failed", message: error instanceof Error ? error.message : String(error) } satisfies BuildReply);
}
