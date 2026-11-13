import express from "express";
import type pg from "pg";
import { z } from "zod";
import type { Procedure } from "dualcontext_domain/common";

const body = z.object({
  name: z.string().trim().min(1),
  appliesWhen: z.array(z.string().trim().min(1)).default([]),
  steps: z.array(z.string().trim().min(1)).default([]),
  impacts: z.array(z.string().trim().min(1)).default([]),
  outputFormat: z.string().default(""),
  enabled: z.boolean().default(true)
});

const columns =
  "p.id, p.name, p.applies_when as \"appliesWhen\", p.steps, p.impacts, p.output_format as \"outputFormat\", p.enabled";

export async function listProcedures(pool: pg.Pool): Promise<Procedure[]> {
  const { rows } = await pool.query<Procedure>(`select ${columns} from procedures p order by p.id`);
  return rows;
}

/** 조사원에 연결된 프로시저를 연결 순서대로. 연결은 조사원이 소유한다. */
export async function listProceduresOf(pool: pg.Pool, researcherId: number): Promise<Procedure[]> {
  const { rows } = await pool.query<Procedure>(
    `select ${columns} from procedures p join researcher_procedures rp on rp.procedure_id = p.id
      where rp.researcher_id = $1 order by rp.position, p.id`,
    [researcherId]
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
      `insert into procedures as p (name, applies_when, steps, impacts, output_format, enabled)
       values ($1, $2, $3, $4, $5, $6)
       returning p.id, p.name, p.applies_when as "appliesWhen", p.steps, p.impacts, p.output_format as "outputFormat", p.enabled`,
      [d.name, d.appliesWhen, d.steps, d.impacts, d.outputFormat, d.enabled]
    );
    response.status(201).json(rows[0]);
  });

  router.put("/procedures/:id", async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const d = parsed.data;
    const { rows } = await pool.query<Procedure>(
      `update procedures as p set name = $2, applies_when = $3, steps = $4, impacts = $5, output_format = $6, enabled = $7, embedding_key = null
        where p.id = $1
        returning p.id, p.name, p.applies_when as "appliesWhen", p.steps, p.impacts, p.output_format as "outputFormat", p.enabled`,
      [Number(request.params.id), d.name, d.appliesWhen, d.steps, d.impacts, d.outputFormat, d.enabled]
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
