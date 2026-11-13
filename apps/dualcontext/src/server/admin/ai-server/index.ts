import express from "express";
import type pg from "pg";
import { z } from "zod";
import type { ModelClient } from "../../model/index.js";

const endpoint = z.object({
  baseUrl: z.string().trim().url(),
  model: z.string().trim(),
  /** 비우면 기존 키를 유지한다. 지우려면 clearApiKey. */
  apiKey: z.string().optional(),
  clearApiKey: z.boolean().optional()
});
const body = z.object({ embedding: endpoint, chat: endpoint });

/**
 * AI 서버 설정: 임베딩 서버와 LLM 서버 각각의 주소·모델·API 키.
 * API 키는 쓰기 전용이다. 조회 응답에는 키가 아니라 설정 여부(hasApiKey)만 담는다.
 */
export function aiServerRouter(pool: pg.Pool, model: ModelClient) {
  const router = express.Router();

  const read = async () => {
    const { rows } = await pool.query(
      `select embedding_base_url, embedding_model, embedding_api_key <> '' as embedding_key,
              chat_base_url, chat_model, chat_api_key <> '' as chat_key from ai_server where id = 1`
    );
    const row = rows[0];
    return {
      embedding: { baseUrl: row.embedding_base_url, model: row.embedding_model, hasApiKey: row.embedding_key },
      chat: { baseUrl: row.chat_base_url, model: row.chat_model, hasApiKey: row.chat_key }
    };
  };

  router.get("/ai-server", async (_request, response) => {
    response.json(await read());
  });

  router.put("/ai-server", async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const { embedding, chat } = parsed.data;
    const key = (value: { apiKey?: string; clearApiKey?: boolean }) => (value.clearApiKey ? "" : value.apiKey || null);
    await pool.query(
      `update ai_server set embedding_base_url = $1, embedding_model = $2, embedding_api_key = coalesce($3, embedding_api_key),
         chat_base_url = $4, chat_model = $5, chat_api_key = coalesce($6, chat_api_key) where id = 1`,
      [embedding.baseUrl, embedding.model, key(embedding), chat.baseUrl, chat.model, key(chat)]
    );
    response.json(await read());
  });

  // 연결 시험을 겸해 서버가 제공하는 모델 목록을 돌려준다.
  router.get("/ai-server/models", async (request, response) => {
    const kind = request.query.kind === "chat" ? "chat" : "embedding";
    try {
      response.json({ models: await model.listModels(kind) });
    } catch (error) {
      response.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
