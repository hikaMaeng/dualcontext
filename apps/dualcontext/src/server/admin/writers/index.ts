import express from "express";
import type pg from "pg";
import { z } from "zod";
import type { WriterConfig } from "dualcontext_domain/common";

const body = z.object({
  name: z.string().trim().min(1),
  engine: z.enum(["template", "llm"]),
  mode: z.enum(["batch", "per_pair"]),
  prompt: z.string().default("")
});

const columns = "id, name, engine, mode, prompt, active";

/**
 * 라이터 관리. mode: batch 는 라이터 한 번에 모든 쌍을, per_pair 는 쌍마다 한 번씩 호출해 결과를 이어 붙인다.
 * 활성 라이터는 MCP 도구가 쓴다(시험 실행은 라이터를 골라 돌려 볼 수 있다).
 */
export function writersRouter(pool: pg.Pool) {
  const router = express.Router();

  router.get("/writers", async (_request, response) => {
    response.json((await pool.query<WriterConfig>(`select ${columns} from writers order by id`)).rows);
  });

  router.post("/writers", async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const d = parsed.data;
    const { rows } = await pool.query<WriterConfig>(
      `insert into writers (name, engine, mode, prompt) values ($1, $2, $3, $4) returning ${columns}`,
      [d.name, d.engine, d.mode, d.prompt]
    );
    response.status(201).json(rows[0]);
  });

  router.put("/writers/:id", async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const d = parsed.data;
    const { rows } = await pool.query<WriterConfig>(
      `update writers set name = $2, engine = $3, mode = $4, prompt = $5 where id = $1 returning ${columns}`,
      [Number(request.params.id), d.name, d.engine, d.mode, d.prompt]
    );
    if (rows.length === 0) return void response.status(404).json({ error: "not found" });
    response.json(rows[0]);
  });

  router.post("/writers/:id/activate", async (request, response) => {
    const id = Number(request.params.id);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("update writers set active = false where active");
      const { rowCount } = await client.query("update writers set active = true where id = $1", [id]);
      if (rowCount === 0) throw new Error("not found");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    response.status(204).end();
  });

  router.delete("/writers/:id", async (request, response) => {
    await pool.query("delete from writers where id = $1", [Number(request.params.id)]);
    response.status(204).end();
  });

  return router;
}
