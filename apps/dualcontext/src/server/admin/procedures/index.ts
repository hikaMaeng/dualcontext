import express from "express";
import type pg from "pg";
import { z } from "zod";
import type { Procedure } from "dualcontext_domain/common";

const body = z.object({
  researcherId: z.number().int(),
  name: z.string().trim().min(1),
  appliesWhen: z.array(z.string().trim().min(1)).default([]),
  steps: z.array(z.string().trim().min(1)).default([]),
  impacts: z.array(z.string().trim().min(1)).default([]),
  outputFormat: z.string().default(""),
  enabled: z.boolean().default(true)
});

const columns =
  "id, researcher_id as \"researcherId\", name, applies_when as \"appliesWhen\", steps, impacts, output_format as \"outputFormat\", enabled";

/** researcherId 를 생략하면 전체를 돌려준다(관리자 화면용). */
export async function listProcedures(pool: pg.Pool, researcherId?: number): Promise<Procedure[]> {
  const { rows } = await pool.query<Procedure>(
    `select ${columns} from procedures where ($1::int is null or researcher_id = $1) order by id`,
    [researcherId ?? null]
  );
  return rows;
}

export function proceduresRouter(pool: pg.Pool) {
  const router = express.Router();

  router.get("/procedures", async (_request, response) => {
    response.json(await listProcedures(pool));
  });

  router.post("/procedures", async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const d = parsed.data;
    const { rows } = await pool.query<Procedure>(
      `insert into procedures (researcher_id, name, applies_when, steps, impacts, output_format, enabled)
       values ($1, $2, $3, $4, $5, $6, $7) returning ${columns}`,
      [d.researcherId, d.name, d.appliesWhen, d.steps, d.impacts, d.outputFormat, d.enabled]
    );
    response.status(201).json(rows[0]);
  });

  router.put("/procedures/:id", async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const d = parsed.data;
    const { rows } = await pool.query<Procedure>(
      `update procedures set researcher_id = $2, name = $3, applies_when = $4, steps = $5, impacts = $6,
         output_format = $7, enabled = $8 where id = $1 returning ${columns}`,
      [Number(request.params.id), d.researcherId, d.name, d.appliesWhen, d.steps, d.impacts, d.outputFormat, d.enabled]
    );
    if (rows.length === 0) return void response.status(404).json({ error: "not found" });
    response.json(rows[0]);
  });

  router.delete("/procedures/:id", async (request, response) => {
    await pool.query("delete from procedures where id = $1", [Number(request.params.id)]);
    response.status(204).end();
  });

  return router;
}
