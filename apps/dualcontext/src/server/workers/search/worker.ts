import { parentPort } from "node:worker_threads";
import { threadData } from "../thread/data.js";
import { createEngine } from "./engine.js";
import type { SearchRequest, SearchThreadData } from "./protocol.js";

/** `cpu.search` 스레드 본체: 요청을 받아 색인 캐시에서 검색하고 topK 자료만 돌려준다. 취소는 공유 플래그로만 받는다. */
const port = parentPort;
if (port === null) throw new Error("search worker must run in a worker thread");

const engine = createEngine({ budgetBytes: threadData<SearchThreadData>().budgetBytes });

port.on("message", (request: SearchRequest) => {
  void engine.run(request, new Int32Array(request.cancel)).then((reply) => port.postMessage(reply));
});
