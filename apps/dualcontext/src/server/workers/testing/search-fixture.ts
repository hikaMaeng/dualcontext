import { parentPort } from "node:worker_threads";
import type { SearchReply, SearchRequest } from "../search/protocol.js";

/**
 * 풀 시험용 가짜 검색 스레드(서버 번들에는 들어가지 않는다). 질의 문자열이 행동을 정한다:
 * `crash` 는 오류로 스레드를 죽이고, `hang` 은 취소 플래그를 무시하고 3초 동안 동기 구간에 갇히고, `echo:<x>` 와 그 밖은 자료 하나를 돌려준다.
 */
const port = parentPort;
if (port === null) throw new Error("fixture must run in a worker thread");

port.on("message", (request: SearchRequest) => {
  if (request.query === "crash") throw new Error("fixture crash");
  if (request.query === "hang") {
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      // 취소 플래그를 확인하지 않는 동기 구간.
    }
  }
  const reply: SearchReply = {
    id: request.id,
    type: "found",
    builtAt: "fixture",
    materials: [{ title: request.query, text: String(process.pid) }],
    scores: [1],
    stats: { warm: true, readMs: 0, buildMs: 0, searchMs: 0, fileBytes: 0 }
  };
  port.postMessage(reply);
});
