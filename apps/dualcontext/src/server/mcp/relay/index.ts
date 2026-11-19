import { Agent, fetch } from "undici";
import { buildError } from "../tools/augment/envelope/index.js";
import type { ToolRunner } from "../tools/augment/run/index.js";

// 중계 응답은 실행이 끝날 때까지(수십 분~) 열려 있다. undici 의 헤더 · 본문 타임아웃(300초)은 끈다.
const patient = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

type Line = { type: "progress"; message?: string } | { type: "result"; isError: boolean; text: string };

/**
 * 엔진 소유자(HTTP 서버 프로세스)의 내부 listener 로 중계하는 실행기. MCP stdio 프로세스가 쓴다.
 * 응답은 줄 단위 JSON 스트림이다(진행 줄 · 마지막 결과 줄). 신호가 abort 되면 연결을 끊고, 서버는 연결 이탈을 보고 실행을 취소한다.
 * 서버가 없으면 명확한 오류를 돌려준다(직접 실행으로 폴백하지 않는다).
 */
export function createRelayRunner(baseUrl: string): ToolRunner {
  return async (args, { signal, progress }) => {
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(`${baseUrl}/internal/augment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
        signal,
        dispatcher: patient
      });
    } catch (error) {
      if (signal.aborted) return { isError: true, text: buildError("cancelled") };
      return { isError: true, text: buildError(`dualcontext server is not reachable (${error instanceof Error ? error.message : String(error)})`) };
    }
    if (!response.ok) return { isError: true, text: buildError(`dualcontext server answered ${response.status}`) };
    const decoder = new TextDecoder();
    let buffer = "";
    let reply: { isError: boolean; text: string } | null = null;
    const handle = (raw: string) => {
      if (raw.trim() === "") return;
      const line = JSON.parse(raw) as Line;
      if (line.type === "progress") progress(line.message ?? "working");
      else if (line.type === "result") reply = { isError: line.isError, text: line.text };
    };
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          handle(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
      }
      handle(buffer + decoder.decode());
    } catch (error) {
      if (signal.aborted) return { isError: true, text: buildError("cancelled") };
      return { isError: true, text: buildError(`relay stream failed (${error instanceof Error ? error.message : String(error)})`) };
    }
    return reply ?? { isError: true, text: buildError("relay ended without a result") };
  };
}
