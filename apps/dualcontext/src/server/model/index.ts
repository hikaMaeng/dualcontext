import type pg from "pg";
import { Agent, fetch } from "undici";
import { AiServerError, streamChat } from "./chat/index.js";
import { createLimiter, retryOverloaded } from "./limit/index.js";

// 임베딩·모델 목록 호출용. 채팅은 chat/ 이 스트리밍으로 따로 다룬다(총 시간이 아니라 유휴 시간으로 끊는다).
// undici 의 헤더 대기 기본값(300초)은 느린 서버에서 `fetch failed` 가 되므로 호출 전용 Agent 로 늘린다.
const patient = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 });

/** 채팅 호출 제어 기본값: 유휴 180초(토큰이 3분간 하나도 안 오면 멈춘 것), 총 1시간(안전장치), 동시 3건, 503·429 는 4회까지 재시도(2·4·8초 백오프). */
export const defaultChatControl = { idleMs: 180_000, totalMs: 3_600_000, maxConcurrent: 3, attempts: 4, retryBaseMs: 2_000 };
export type ChatControl = typeof defaultChatControl;

export type Endpoint = { baseUrl: string; model: string; apiKey: string };
export type AiServer = { embedding: Endpoint; chat: Endpoint };

export class ModelNotConfigured extends Error {}

/**
 * OpenAI 호환 AI 서버 클라이언트. 임베딩 서버와 LLM 서버는 따로이며 설정(ai_server)은 호출마다 읽는다.
 * API 키는 DB 값이 있으면 그것, 없으면 환경 변수 값이다.
 */
export function createModelClient(pool: pg.Pool, envApiKey: string, control: ChatControl = defaultChatControl) {
  const limit = createLimiter(control.maxConcurrent);

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

  async function call(endpoint: Endpoint, path: string, body?: unknown) {
    const response = await fetch(`${endpoint.baseUrl.replace(/\/$/, "")}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      // 추론 모델은 긴 컨텍스트에서 수 분이 걸리고, 한 서버를 여럿이 나눠 쓰면 대기까지 더해진다.
      signal: AbortSignal.timeout(900_000),
      dispatcher: patient
    });
    if (!response.ok) throw new AiServerError(response.status, path, (await response.text()).slice(0, 200));
    return (await response.json()) as Record<string, any>;
  }

  async function modelIds(endpoint: Endpoint): Promise<string[]> {
    return ((await call(endpoint, "/models")).data as { id: string }[]).map((model) => model.id);
  }

  return {
    settings,
    /** 서버가 제공하는 모델 id 목록. 연결 시험을 겸한다. */
    async listModels(kind: "embedding" | "chat"): Promise<string[]> {
      return modelIds((await settings())[kind]);
    },
    /** 입력 순서대로 임베딩을 돌려준다. 임베딩 모델이 비어 있으면 ModelNotConfigured. */
    async embed(texts: string[]): Promise<number[][]> {
      const { embedding } = await settings();
      if (!embedding.model) throw new ModelNotConfigured("embedding model is not configured");
      const json = await call(embedding, "/embeddings", { model: embedding.model, input: texts });
      return (json.data as { index: number; embedding: number[] }[]).sort((a, b) => a.index - b.index).map((entry) => entry.embedding);
    },
    /**
     * 응답 텍스트를 돌려준다. 스트리밍으로 받아 유휴 시간으로만 멈춤을 판단하고(총 시간으로 자르지 않는다),
     * 동시 호출 수를 제한하며, 서버가 용량 부족(503)·과다(429)로 답하면 백오프로 다시 시도한다.
     * max_tokens 는 제한하지 않는다(추론 모델이라 제한하면 content 가 비어 온다). content 가 비면 오류로 올린다.
     */
    async chat(prompt: string): Promise<string> {
      const { chat } = await settings();
      if (!chat.model) throw new ModelNotConfigured("chat model is not configured");
      const content = await limit(() => retryOverloaded(() => streamChat(chat, prompt, control), { attempts: control.attempts, baseMs: control.retryBaseMs }));
      if (content === "") throw new Error("chat model returned empty content");
      return content;
    }
  };
}

export type ModelClient = ReturnType<typeof createModelClient>;
