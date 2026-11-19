import express from "express";
import type { Server } from "node:http";
import { RunAborted } from "dualcontext_domain/common";
import { efforts } from "../mcp/tools/augment/effort/index.js";
import { buildError } from "../mcp/tools/augment/envelope/index.js";
import type { ToolRunner } from "../mcp/tools/augment/run/index.js";
import type { McpEffort } from "dualcontext_domain/common";

/** 진행이 없어도 이 간격마다 줄을 보낸다(중계 · 클라이언트의 진행 알림이 끊기지 않게 한다). */
export const heartbeatMs = 15_000;

/**
 * 엔진 소유자(HTTP 서버 프로세스)의 **내부 전용** 앱. MCP stdio 프로세스가 중계하는 `POST /internal/augment` 하나뿐이다.
 * 별도 포트에 loopback 으로만 열고(compose 에서 게시하지 않는다) 관리자 앱과 같은 listener 를 쓰지 않는다.
 * 응답은 줄 단위 JSON 스트림이다: `{type:"progress"}` 줄들, 마지막에 `{type:"result", isError, text}`.
 * **연결 이탈 판정**: 응답의 `close` 이면서 아직 끝나지 않았을 때(`!writableEnded`). 요청 `close` 는 정상 완료에도 발생하므로 쓰지 않는다.
 * 이탈 감시는 본문 파서보다 앞에서 건다(본문 수신 중 끊겨도 놓치지 않는다).
 */
export function createInternalApp(runner: ToolRunner, intervalMs = heartbeatMs) {
  const app = express();
  app.post(
    "/internal/augment",
    (request, response, next) => {
      const gone = new AbortController();
      response.on("close", () => {
        if (!response.writableEnded) gone.abort(new RunAborted("cancelled"));
      });
      response.locals.gone = gone;
      next();
    },
    express.json({ limit: "1mb" }),
    async (request, response) => {
      const gone = response.locals.gone as AbortController;
      const query = typeof request.body?.query === "string" ? request.body.query : "";
      const effort = (request.body?.effort ?? "light") as McpEffort;
      if (query.trim() === "" || !efforts.includes(effort)) return void response.status(400).json({ error: "query (non-empty string) and optional effort (light|middle|high|xhigh) are required" });
      response.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache", "x-accel-buffering": "no" });
      const write = (line: object) => {
        if (!response.writableEnded && !response.destroyed) response.write(`${JSON.stringify(line)}\n`);
      };
      const beat = setInterval(() => write({ type: "progress", message: "working" }), intervalMs);
      try {
        const reply = await runner({ query, effort }, { signal: gone.signal, progress: (message) => write({ type: "progress", message }) });
        write({ type: "result", ...reply });
      } catch (error) {
        write({ type: "result", isError: true, text: buildError(error instanceof Error ? error.message : String(error)) });
      } finally {
        clearInterval(beat);
        response.end();
      }
    }
  );
  return app;
}

/** 내부 listener 를 loopback 에만 연다. */
export function listenInternal(app: express.Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });
}
