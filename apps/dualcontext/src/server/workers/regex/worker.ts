import { parentPort } from "node:worker_threads";
import { judgeTargets } from "./judge.js";
import type { RegexReply, RegexRequest } from "./protocol.js";

/** `cpu.regex` 스레드 본체. 일을 시작하기 직전에 시작을 알린다: 메인은 그 시각부터 시한(200ms)을 잰다. */
const port = parentPort;
if (port === null) throw new Error("regex worker must run in a worker thread");

port.on("message", (request: RegexRequest) => {
  port.postMessage({ type: "started", id: request.id } satisfies RegexReply);
  try {
    port.postMessage({ type: "done", id: request.id, wanted: judgeTargets(request.include, request.exclude, request.targets) } satisfies RegexReply);
  } catch (error) {
    port.postMessage({ type: "failed", id: request.id, message: error instanceof Error ? error.message : String(error) } satisfies RegexReply);
  }
});
