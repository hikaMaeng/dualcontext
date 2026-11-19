import { isRunAborted } from "dualcontext_domain/common";
import { AiServerError, ChatStalledError, EmptyContentError } from "../chat/index.js";
import { StreamLimitError } from "../stream/index.js";

const transientStatus = new Set([429, 500, 502, 503, 504]);

/**
 * 같은 요청을 다시 보내볼 만한 일시 오류인가: 서버 과다 · 일시 장애 상태 코드, 네트워크 단절, 유휴 중단, 빈 응답.
 * 취소(RunAborted) · 총 시간 상한 · 스트림 가드 위반 · 4xx(429 제외) · 설정 오류는 아니다.
 */
export function isTransient(error: unknown): boolean {
  if (isRunAborted(error) || error instanceof StreamLimitError) return false;
  if (error instanceof AiServerError) return transientStatus.has(error.status);
  if (error instanceof ChatStalledError) return !error.message.includes("total time limit");
  if (error instanceof EmptyContentError) return true;
  // undici 의 네트워크 오류는 TypeError("fetch failed") 에 cause 로 코드가 붙는다.
  if (error instanceof TypeError) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|UND_ERR_(SOCKET|CONNECT_TIMEOUT|HEADERS_TIMEOUT|BODY_TIMEOUT))/.test(code);
}

/** 지수 백오프(기준 · 2배씩)에 ±25% 지터. attempt 는 방금 실패한 시도 번호(1부터). */
export const backoffMs = (baseMs: number, attempt: number, random: () => number = Math.random): number => Math.round(baseMs * 2 ** (attempt - 1) * (0.75 + random() * 0.5));
