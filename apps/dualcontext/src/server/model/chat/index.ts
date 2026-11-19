import { Agent, fetch, type Response } from "undici";
import { readChatStream, StreamLimitError, type StreamResult } from "../stream/index.js";

export type ChatEndpoint = { baseUrl: string; model: string; apiKey: string };
export type ChatTimeouts = {
  /** 본문이 시작된 뒤 바이트가 이 시간 동안 하나도 안 오면 멈춘 것으로 보고 끊는다. */
  idleMs: number;
  /** 요청 하나의 총 시간 상한(헤더 대기 포함). 정상 호출을 자르는 값이 아니라 안전장치다. */
  totalMs: number;
};

/** AI 서버가 비정상 상태 코드로 답했다. 재시도 판단에 status 를 쓴다. */
export class AiServerError extends Error {
  constructor(readonly status: number, path: string, detail: string) {
    super(`AI server ${path} answered ${status}: ${detail}`);
  }
}

export class ChatStalledError extends Error {}

/** 응답 본문이 비었다(추론만 하고 content 가 없는 경우 포함). 다시 생성하면 나올 수 있어 일시 오류로 본다. */
export class EmptyContentError extends Error {}

/** 오류 본문은 앞 4KB 만 읽는다(전체를 받은 뒤 자르지 않는다). */
const errorBodyBytes = 4096;
/** 스트리밍이 아닌 JSON 응답의 상한. */
export const maxJsonBytes = 8 * 1024 * 1024;

/** 중단·종료 시점까지 받은 양. 「계속 생각만 했나 · 아무것도 안 왔나」를 오류 문구만으로 가리려고 남긴다. */
const progressText = (progress: StreamResult) => `(reasoningChars=${progress.reasoningChars} contentChars=${progress.content.length})`;

// 헤더·본문 대기는 아래 AbortController 가 정한다. undici 의 기본 300초 제한은 끈다.
const unlimited = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

/** 본문을 수신 중에 바이트 상한을 검사하며 읽는다. 상한을 넘으면 중단한다(`response.text()` 처럼 전부 받은 뒤 자르지 않는다). */
export async function readBodyLimited(response: Response, maxBytes: number): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  if (!response.body) return "";
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw new StreamLimitError(`response body exceeded ${maxBytes} bytes`);
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

/** 오류 응답 본문의 앞부분만(상한까지 읽고 멈춘다). */
export async function readErrorDetail(response: Response): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  if (!response.body) return "";
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    text += decoder.decode(chunk, { stream: true });
    bytes += chunk.byteLength;
    if (bytes >= errorBodyBytes) break;
  }
  return text.slice(0, 200);
}

/**
 * chat/completions 를 스트리밍으로 호출해 본문을 돌려준다. 이 서버의 모델은 추론 모델이라 본문 전에
 * reasoning_content 를 길게 내보낸다. 총 시간으로 자르면 「멈춤」과 「줄 서서 기다림 · 오래 생각함」을 구분할 수 없으므로,
 * 토큰이 계속 오는 한 기다리고 유휴 시간만큼 조용하면 끊는다(실행 98: 901초 타임아웃 프롬프트가 혼자 돌리면 365초에 끝났다).
 * max_tokens 는 제한하지 않는다(제한하면 content 가 비어 온다). signal 이 abort 되면 즉시 끊고 그 reason 을 던진다.
 */
export async function streamChat(endpoint: ChatEndpoint, prompt: string, timeouts: ChatTimeouts, signal?: AbortSignal): Promise<string> {
  const path = "/chat/completions";
  const controller = new AbortController();
  const progress: StreamResult = { content: "", reasoningChars: 0, finished: false };
  const total = setTimeout(() => controller.abort(new ChatStalledError(`chat exceeded total time limit of ${Math.round(timeouts.totalMs / 1000)}s ${progressText(progress)}`)), timeouts.totalMs);
  let idle: ReturnType<typeof setTimeout> | undefined;
  const armIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(new ChatStalledError(`chat produced no data for ${Math.round(timeouts.idleMs / 1000)}s ${progressText(progress)}`)), timeouts.idleMs);
  };
  const onParentAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onParentAbort();
    else signal.addEventListener("abort", onParentAbort, { once: true });
  }
  try {
    const response = await fetch(`${endpoint.baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}) },
      body: JSON.stringify({ model: endpoint.model, temperature: 0, stream: true, messages: [{ role: "user", content: prompt }] }),
      signal: controller.signal,
      dispatcher: unlimited
    });
    if (!response.ok) throw new AiServerError(response.status, path, await readErrorDetail(response));
    armIdle();
    if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
      // 스트리밍을 지원하지 않는 서버는 한 번에 JSON 으로 답한다(수신 상한 안에서만 읽는다).
      const json = JSON.parse(await readBodyLimited(response, maxJsonBytes)) as { choices?: { message?: { content?: string } }[] };
      return String(json.choices?.[0]?.message?.content ?? "").trim();
    }
    const result = await readChatStream(response.body as unknown as AsyncIterable<Uint8Array>, armIdle, progress);
    if (!result.finished) throw new ChatStalledError(`chat stream ended before completion ${progressText(result)}`);
    const content = result.content.trim();
    if (content === "") throw new EmptyContentError(`chat model returned empty content ${progressText(result)}`);
    return content;
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof Error) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(total);
    clearTimeout(idle);
    signal?.removeEventListener("abort", onParentAbort);
  }
}
