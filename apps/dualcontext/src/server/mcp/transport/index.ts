import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, MessageExtraInfo, RequestId } from "@modelcontextprotocol/sdk/types.js";

/** 요청 id → 이 요청 전용 취소 신호. 도구 핸들러가 `extra.requestId` 로 꺼낸다. */
export type RequestTracker = { signalFor(id: RequestId): AbortSignal | undefined };

export type CancelAwareTransport = Transport & RequestTracker & {
  /** 진행 중인 모든 요청을 취소한다(stdin EOF · 프로세스 종료). */
  abortAll(): void;
};

const keyOf = (id: RequestId) => JSON.stringify(id);

type Message = { id?: RequestId; method?: string; params?: { requestId?: RequestId }; result?: unknown; error?: unknown };

/**
 * MCP SDK 의 stdio transport 를 감싸 **취소를 이 프로세스가 직접 소유**한다(SDK 1.32.2 의 한계를 메운다):
 * - 요청(tools/call)을 **수신하는 즉시** id 별 취소 신호를 등록한다(핸들러가 늦게 돌아도 취소 알림을 놓치지 않는다).
 * - `notifications/cancelled` 는 요청 ID 0 을 포함해 직접 처리한다(SDK 는 falsy id 를 건너뛴다). 해당 요청의 신호를 abort 한다.
 * - 취소된 요청의 응답은 보내지 않는다(SDK 의 응답 억제는 우리 신호와 연결되어 있지 않다).
 * - onclose 는 체인한다(덮어쓰지 않으므로 SDK 의 진행 중 요청 abort 가 보존된다). 닫히면 전부 취소한다.
 * stdin EOF 는 SDK transport 가 onclose 로 알리지 않으므로 호출자가 `abortAll()` + `close()` 를 연결한다.
 * 키: 요청 id(JSON). 수명: 응답을 보내거나 transport 가 닫힐 때까지. 상한: 동시에 진행 중인 요청 수.
 */
export function createCancelAwareTransport(inner: Transport): CancelAwareTransport {
  const controllers = new Map<string, AbortController>();
  const cancelled = new Set<string>();
  let handler: Transport["onmessage"];

  const intercept = (message: JSONRPCMessage) => {
    const m = message as Message;
    if (m.method === "tools/call" && m.id !== undefined) controllers.set(keyOf(m.id), new AbortController());
    else if (m.method === "notifications/cancelled" && m.params?.requestId !== undefined) {
      const key = keyOf(m.params.requestId);
      const controller = controllers.get(key);
      if (controller) {
        cancelled.add(key);
        controller.abort();
      }
    }
  };

  const abortAll = () => {
    for (const [key, controller] of controllers) {
      cancelled.add(key);
      controller.abort();
    }
  };

  const wrapper: CancelAwareTransport = {
    start: () => inner.start(),
    close: () => inner.close(),
    async send(message: JSONRPCMessage, options?: TransportSendOptions) {
      const m = message as Message;
      if (m.id !== undefined && (m.result !== undefined || m.error !== undefined)) {
        const key = keyOf(m.id);
        const drop = cancelled.has(key);
        controllers.delete(key);
        cancelled.delete(key);
        if (drop) return;
      }
      await inner.send(message, options);
    },
    signalFor: (id) => controllers.get(keyOf(id))?.signal,
    abortAll,
    get onmessage() {
      return handler;
    },
    set onmessage(next) {
      handler = next;
      inner.onmessage = next
        ? (<T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => {
            intercept(message);
            next(message, extra);
          })
        : undefined;
    },
    get onclose() {
      return inner.onclose;
    },
    set onclose(next) {
      inner.onclose = next
        ? () => {
            abortAll();
            next();
          }
        : () => abortAll();
    },
    get onerror() {
      return inner.onerror;
    },
    set onerror(next) {
      inner.onerror = next;
    },
    get sessionId() {
      return inner.sessionId;
    },
    setProtocolVersion: inner.setProtocolVersion ? (version) => inner.setProtocolVersion?.(version) : undefined
  };
  return wrapper;
}
