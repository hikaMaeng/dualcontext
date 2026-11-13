// 응답 헤더를 DELAY_S 초 뒤에 보내는 가짜 OpenAI 호환 서버를 띄우고, 서버의 채팅 클라이언트가 그 지연을 견디는지 잰다.
//   node --import tsx test/20261113/slow-header-probe.mjs 320
// 목적: 증강 전·후 답변이 정확히 ~300초에 `fetch failed` 가 된 원인이 undici 기본 headersTimeout(300초)인지 확인한다.
import http from "node:http";
import { createModelClient } from "../../apps/dualcontext/src/server/model/index.ts";

const delaySeconds = Number(process.argv[2] ?? 320);
const server = http.createServer((request, response) => {
  request.resume();
  setTimeout(() => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: "slow answer ok" } }] }));
  }, delaySeconds * 1000);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

// 클라이언트는 DB 에서 설정을 읽는다. 여기서는 설정 한 행만 돌려주는 가짜 풀을 쓴다.
const pool = {
  query: async () => ({
    rows: [{ embedding_base_url: baseUrl, embedding_model: "m", embedding_api_key: "", chat_base_url: baseUrl, chat_model: "m", chat_api_key: "" }]
  })
};
const model = createModelClient(pool, "");

const started = Date.now();
try {
  const text = await model.chat("hi");
  console.log(`RESULT ok after ${((Date.now() - started) / 1000).toFixed(1)}s: ${text}`);
} catch (error) {
  console.log(`RESULT error after ${((Date.now() - started) / 1000).toFixed(1)}s: ${error.message} | cause: ${error.cause?.code ?? error.cause?.message ?? "-"}`);
}
server.close();
process.exit(0);
