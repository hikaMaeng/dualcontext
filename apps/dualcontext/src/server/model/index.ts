import type pg from "pg";

export type Endpoint = { baseUrl: string; model: string; apiKey: string };
export type AiServer = { embedding: Endpoint; chat: Endpoint };

export class ModelNotConfigured extends Error {}

/**
 * OpenAI 호환 AI 서버 클라이언트. 임베딩 서버와 LLM 서버는 따로이며 설정(ai_server)은 호출마다 읽는다.
 * API 키는 DB 값이 있으면 그것, 없으면 환경 변수 값이다.
 */
export function createModelClient(pool: pg.Pool, envApiKey: string) {
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
      signal: AbortSignal.timeout(300_000)
    });
    if (!response.ok) throw new Error(`AI server ${path} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
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
     * 응답 텍스트를 돌려준다. 이 서버의 모델은 추론 모델이라 reasoning_content 를 먼저 길게 내므로
     * max_tokens 를 제한하지 않는다(제한하면 content 가 비어 온다). content 가 비면 오류로 올린다.
     */
    async chat(prompt: string): Promise<string> {
      const { chat } = await settings();
      if (!chat.model) throw new ModelNotConfigured("chat model is not configured");
      const json = await call(chat, "/chat/completions", { model: chat.model, temperature: 0, messages: [{ role: "user", content: prompt }] });
      const content = String(json.choices?.[0]?.message?.content ?? "").trim();
      if (content === "") throw new Error("chat model returned empty content");
      return content;
    }
  };
}

export type ModelClient = ReturnType<typeof createModelClient>;
