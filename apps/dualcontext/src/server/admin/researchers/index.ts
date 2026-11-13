import express from "express";
import type pg from "pg";
import { z } from "zod";
import type { Researcher } from "dualcontext_domain/common";

const body = z.object({
  name: z.string().trim().min(1),
  description: z.string().default(""),
  keywords: z.array(z.string().trim().min(1)).default([]),
  enabled: z.boolean().default(true)
});

const columns = "id, name, description, keywords, enabled";

export async function listResearchers(pool: pg.Pool): Promise<Researcher[]> {
  const { rows } = await pool.query<Researcher>(`select ${columns} from researchers order by id`);
  return rows;
}

export function researchersRouter(pool: pg.Pool) {
  const router = express.Router();

  router.get("/researchers", async (_request, response) => {
    response.json(await listResearchers(pool));
  });

  router.post("/researchers", async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const { name, description, keywords, enabled } = parsed.data;
    const { rows } = await pool.query<Researcher>(
      `insert into researchers (name, description, keywords, enabled) values ($1, $2, $3, $4) returning ${columns}`,
      [name, description, keywords, enabled]
    );
    response.status(201).json(rows[0]);
  });

  router.put("/researchers/:id", async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const { name, description, keywords, enabled } = parsed.data;
    const { rows } = await pool.query<Researcher>(
      `update researchers set name = $2, description = $3, keywords = $4, enabled = $5 where id = $1 returning ${columns}`,
      [Number(request.params.id), name, description, keywords, enabled]
    );
    if (rows.length === 0) return void response.status(404).json({ error: "not found" });
    response.json(rows[0]);
  });

  router.delete("/researchers/:id", async (request, response) => {
    await pool.query("delete from researchers where id = $1", [Number(request.params.id)]);
    response.status(204).end();
  });

  return router;
}
