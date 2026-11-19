import type pg from "pg";
import { Agent, fetch } from "undici";
import { createTaskQueue, RetryLater, type Priority, type QueueStats } from "../queue/index.js";
import { AiServerError, EmptyContentError, maxJsonBytes, readBodyLimited, readErrorDetail, streamChat } from "./chat/index.js";
import { backoffMs, isTransient } from "./retry/index.js";

// 임베딩·모델 목록 호출용. 채팅은 chat/ 이 스트리밍으로 따로 다룬다(총 시간이 아니라 유휴 시간으로 끊는다).
// undici 의 헤더 대기 기본값(300초)은 느린 서버에서 `fetch failed` 가 되므로 호출 전용 Agent 로 늘린다.
const patient = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 });

const positiveInt = (name: string, fallback: number): number => {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

/**
 * 채팅 호출 제어 기본값: 유휴 600초(토큰이 10분간 하나도 안 오면 멈춘 것), 총 1시간(안전장치), 일시 오류 총 4번 시도(2·4·8초 백오프 + 지터, 지연 재투입).
 * 소비자 수 = 추론 서버로 나가는 동시 요청의 상한이다(제한기가 아니라 큐를 당겨 가는 일꾼 수): 채팅 기본 9(HTTP 1 + stdio 2 세션이 각자 3씩 쓰던 합산),
 * 임베딩 기본 32(기존에는 제한이 없었다). 환경 변수 DUALCONTEXT_CHAT_WORKERS · DUALCONTEXT_EMBED_WORKERS 로 바꾼다. 설계: docs/execution-design.md.
 */
export const defaultChatControl = {
  idleMs: 600_000,
  totalMs: 3_600_000,
  attempts: 4,
  retryBaseMs: 2_000,
  chatWorkers: positiveInt("DUALCONTEXT_CHAT_WORKERS", 9),
  embedWorkers: positiveInt("DUALCONTEXT_EMBED_WORKERS", 32)
};
export type ChatControl = typeof defaultChatControl;

export type Endpoint = { baseUrl: string; model: string; apiKey: string };
export type AiServer = { embedding: Endpoint; chat: Endpoint };

export class ModelNotConfigured extends Error {}

/** 한 번의 논리 호출 결과. attempts = 네트워크 시도 수(일시 오류 재시도 포함). */
export type ChatOutcome = { text: string; attempts: number };

export type RunBinding = { runKey: string; signal: AbortSignal; priority?: Priority };

/**
 * 추론 서버 클라이언트. chat · embed 는 각자의 **작업 큐**에 담기고 소비자(일꾼)가 당겨 간다(모든 요청을 받는다. 부하는 일꾼 수만큼).
 * - `forRun` 은 실행에 바인딩된 façade 를 돌려준다: runKey(공정성 단위)와 취소 신호가 모든 호출에 자동으로 붙는다.
 * - `background` 는 갱신 · 백필용(당기는 순서가 뒤, aging 으로 기아 방지). `pinned` 는 설정을 고정한다(DB 를 다시 읽지 않는다).
 * - 취소 · 일시 오류 재시도는 큐가 처리한다(RunAborted 는 재시도하지 않는다).
 */
export interface ModelClient {
  settings(): Promise<AiServer>;
  listModels(kind: "embedding" | "chat"): Promise<string[]>;
  /** 입력 순서대로 임베딩을 돌려준다. 임베딩 모델이 비어 있으면 ModelNotConfigured. */
  embed(texts: string[]): Promise<number[][]>;
  /** 응답 텍스트. content 가 비면 오류로 올린다(max_tokens 는 제한하지 않는다: 추론 모델이라 제한하면 content 가 비어 온다). */
  chat(prompt: string): Promise<string>;
  chatDetailed(prompt: string): Promise<ChatOutcome>;
  forRun(binding: RunBinding): ModelClient;
  background(): ModelClient;
  pinned(ai: AiServer): ModelClient;
  stats(): { chat: QueueStats; embed: QueueStats };
  close(): Promise<void>;
}

type Bound = { runKey?: string; signal?: AbortSignal; priority?: Priority; pinned?: AiServer };
type ChatJob = { endpoint: Endpoint; prompt: string };
type EmbedJob = { endpoint: Endpoint; model: string; texts: string[] };

export function createModelClient(pool: pg.Pool, envApiKey: string, control: ChatControl = defaultChatControl): ModelClient {
  async function settings(): Promise<AiServer> {
    const { rows } = await pool.query(
      `select embedding_base_url, embedding_model, embedding_api_key, chat_base_url, chat_model, chat_api_key from ai_server where id = 1`
    );
    const row = rows[0];
    return {
      embedding: { baseUrl: row.embedding_base_url, model: row.embedding_model, apiKey: row.embedding_api_key || envApiKey },
      chat: { baseUrl: row.chat_base_url, model: row.chat_model, apiKey: row.chat_api_key || envApiKey }
    };
  }

  async function call(endpoint: Endpoint, path: string, body: unknown, signal?: AbortSignal) {
    // 추론 모델은 긴 컨텍스트에서 수 분이 걸리고, 한 서버를 여럿이 나눠 쓰면 대기까지 더해진다.
    const timeout = AbortSignal.timeout(900_000);
    const response = await fetch(`${endpoint.baseUrl.replace(/\/$/, "")}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      dispatcher: patient
    });
    if (!response.ok) throw new AiServerError(response.status, path, await readErrorDetail(response));
    // 수신 중 바이트 상한 안에서만 읽고 파싱한다(큰 응답이 이벤트 루프를 오래 잡지 않게).
    return JSON.parse(await readBodyLimited(response, maxJsonBytes)) as Record<string, any>;
  }

  /** 일시 오류면 지연 재투입을 요청하고, 아니면 그대로 던진다. 취소는 재시도하지 않는다. */
  const retryOrThrow = (error: unknown, attempt: number, signal: AbortSignal): never => {
    if (!signal.aborted && isTransient(error) && attempt < control.attempts) throw new RetryLater(backoffMs(control.retryBaseMs, attempt), error);
    throw error;
  };

  const chatQueue = createTaskQueue<ChatJob, ChatOutcome>({
    workers: control.chatWorkers,
    attempt: async (job, { attempt, signal }) => {
      try {
        const text = await streamChat(job.endpoint, job.prompt, control, signal);
        if (text === "") throw new EmptyContentError("chat model returned empty content");
        return { text, attempts: attempt };
      } catch (error) {
        return retryOrThrow(error, attempt, signal);
      }
    }
  });

  const embedQueue = createTaskQueue<EmbedJob, number[][]>({
    workers: control.embedWorkers,
    attempt: async (job, { attempt, signal }) => {
      try {
        const json = await call(job.endpoint, "/embeddings", { model: job.model, input: job.texts }, signal);
        return (json.data as { index: number; embedding: number[] }[]).sort((a, b) => a.index - b.index).map((entry) => entry.embedding);
      } catch (error) {
        return retryOrThrow(error, attempt, signal);
      }
    }
  });

  function bind(bound: Bound): ModelClient {
    const resolve = bound.pinned ? async () => bound.pinned as AiServer : settings;
    const submitOptions = () => ({ ...(bound.runKey !== undefined ? { runKey: bound.runKey } : {}), ...(bound.priority ? { priority: bound.priority } : {}), ...(bound.signal ? { signal: bound.signal } : {}) });
    const client: ModelClient = {
      settings: resolve,
      async listModels(kind) {
        const endpoint = (await resolve())[kind];
        return ((await call(endpoint, "/models", undefined, bound.signal)).data as { id: string }[]).map((model) => model.id);
      },
      async embed(texts) {
        const { embedding } = await resolve();
        if (!embedding.model) throw new ModelNotConfigured("embedding model is not configured");
        return embedQueue.submit({ endpoint: embedding, model: embedding.model, texts }, submitOptions());
      },
      async chatDetailed(prompt) {
        const { chat } = await resolve();
        if (!chat.model) throw new ModelNotConfigured("chat model is not configured");
        return chatQueue.submit({ endpoint: chat, prompt }, submitOptions());
      },
      async chat(prompt) {
        return (await client.chatDetailed(prompt)).text;
      },
      forRun: (binding) => bind({ ...bound, ...binding }),
      background: () => bind({ ...bound, priority: "background" }),
      pinned: (ai) => bind({ ...bound, pinned: ai }),
      stats: () => ({ chat: chatQueue.stats(), embed: embedQueue.stats() }),
      close: async () => {
        await Promise.all([chatQueue.close(), embedQueue.close()]);
      }
    };
    return client;
  }

  return bind({});
}
