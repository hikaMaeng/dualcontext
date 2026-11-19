import { parentPort } from "node:worker_threads";
import { threadData } from "../thread/data.js";
import type { BuildJob, BuildReply } from "../build/protocol.js";

/**
 * 풀 시험용 가짜 빌드 스레드(서버 번들에는 들어가지 않는다). 작업의 `root` 문자열이 행동을 정한다:
 * `sleep:<ms>` 는 그만큼 쉬고 끝나고(결과의 `builtAt` 이 작업 id), `hang` 은 끝나지 않는 동기 루프에 갇히고, `fail` 은 실패를 알린다.
 */
const port = parentPort;
if (port === null) throw new Error("fixture must run in a worker thread");

const job = threadData<BuildJob>();
const [mode, argument] = job.root.split(":");
if (mode === "hang") {
  for (;;) {
    // 끝나지 않는 동기 구간: 부모가 스레드를 죽여야만 끝난다.
  }
}
if (mode === "fail") port.postMessage({ type: "failed", message: "fixture failure" } satisfies BuildReply);
else {
  await new Promise((resolve) => setTimeout(resolve, Number(argument ?? 0)));
  port.postMessage({ type: "done", builtAt: job.jobId, stats: { files: 0, symbols: 0, callEdges: 0, importEdges: 0, skippedFiles: 0, truncated: false } } satisfies BuildReply);
}
