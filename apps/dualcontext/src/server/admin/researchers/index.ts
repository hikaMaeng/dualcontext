import express from "express";
import type pg from "pg";
import { z } from "zod";
import type { Researcher } from "dualcontext_domain/common";
import { codebaseConfigSchema } from "../../collect/codebase/index.js";
import { crawlerConfigSchema } from "../../collect/crawler/config/index.js";
import { stageSchema } from "../../routing/config/schema.js";
import { defaultProcedureProblem } from "./default-procedure/index.js";

const identifier = z.string().regex(/^[a-z_][a-z0-9_]*$/);
const topK = z.number().int().min(1).max(20);

const common = {
  name: z.string().trim().min(1),
  description: z.string().default(""),
  keywords: z.array(z.string().trim().min(1)).default([]),
  enabled: z.boolean().default(true),
  procedureIds: z.array(z.number().int()).default([]),
  /** 기본 프로시저: 프로시저 라우팅이 하나도 고르지 못했을 때 대신 붙는다. procedureIds 안의 것이어야 한다. 생략하면 생성은 null, 수정은 기존 값을 유지한다(연결이 풀렸으면 null). */
  defaultProcedureId: z.number().int().nullable().optional(),
  /** 개별 라우터(조사원 하나를 쓸지 판정하는 단계 파이프라인). null 이면 전역 라우터가 고른다. */
  router: stageSchema.nullable().default(null)
};

const body = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("duckduckgo"), config: z.object({ topK: topK.default(5), rewrite: z.boolean().optional() }) }),
  z.object({
    ...common,
    type: z.literal("pgvector"),
    config: z.object({
      table: identifier,
      vectorColumn: identifier,
      textColumn: identifier,
      titleColumn: identifier.optional(),
      /** MRL 축소 차원 컬럼(HNSW 인덱스가 걸린 컬럼). 주면 reducedDim 도 필요하다. */
      reducedColumn: identifier.optional(),
      reducedDim: z.number().int().min(1).optional(),
      /** 컨텍스트에 싣는 자료 길이(글자 수). 기본 1200. */
      snippetChars: z.number().int().min(100).max(8000).optional(),
      /** 자료(행) 단위 관련도 기준(코사인 유사도). 기본 0.72, 0 이면 거르지 않는다. */
      minScore: z.number().min(0).max(1).optional(),
      idColumn: z.string().optional(),
      identifierSearch: z.boolean().optional(),
      topK: topK.default(3)
    })
  }),
  z.object({ ...common, type: z.literal("folder"), config: z.object({ path: z.string().trim().min(1), topK: topK.default(3) }) }),
  z.object({ ...common, type: z.literal("codebase"), config: codebaseConfigSchema }),
  z.object({ ...common, type: z.literal("crawler"), config: crawlerConfigSchema })
]).superRefine((data, context) => {
  const problem = defaultProcedureProblem(data.procedureIds, data.defaultProcedureId ?? null);
  if (problem) context.addIssue({ code: "custom", path: ["defaultProcedureId"], message: problem });
});

const select = `select r.id, r.name, r.description, r.keywords, r.enabled, r.type, r.config, r.router, r.default_procedure_id as "defaultProcedureId",
  coalesce((select array_agg(rp.procedure_id order by rp.position, rp.procedure_id)
              from researcher_procedures rp where rp.researcher_id = r.id), '{}') as "procedureIds"
  from researchers r`;

export async function listResearchers(pool: pg.Pool): Promise<Researcher[]> {
  const { rows } = await pool.query<Researcher>(`${select} order by r.id`);
  return rows;
}

/** 수정 요청이 defaultProcedureId 를 생략했을 때: 기존 기본 프로시저를 유지한다(새 연결 목록에 없으면 null). 이 필드를 모르는 옛 클라이언트가 PUT 해도 기본이 지워지지 않는다. */
async function keptDefault(client: pg.PoolClient, id: number, procedureIds: number[]): Promise<number | null> {
  const { rows } = await client.query<{ current: number | null }>("select default_procedure_id as current from researchers where id = $1", [id]);
  const current = rows[0]?.current ?? null;
  return current !== null && procedureIds.includes(current) ? current : null;
}

/** 한 트랜잭션에서 조사원 행과 프로시저 연결(순서 포함)을 함께 저장한다. */
async function save(pool: pg.Pool, id: number | null, data: z.infer<typeof body>): Promise<Researcher> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const defaultProcedureId = data.defaultProcedureId !== undefined ? data.defaultProcedureId : id === null ? null : await keptDefault(client, id, data.procedureIds);
    const { rows } = await client.query<{ id: number }>(
      id === null
        ? `insert into researchers (name, description, keywords, enabled, type, config, router, default_procedure_id) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`
        : `update researchers set name = $1, description = $2, keywords = $3, enabled = $4, type = $5, config = $6, router = $7, default_procedure_id = $8, embedding_key = null
            where id = $9 returning id`,
      [data.name, data.description, data.keywords, data.enabled, data.type, data.config, data.router === null ? null : JSON.stringify(data.router), defaultProcedureId, ...(id === null ? [] : [id])]
    );
    if (rows.length === 0) throw new Error("not found");
    await client.query("delete from researcher_procedures where researcher_id = $1", [rows[0].id]);
    for (const [position, procedureId] of data.procedureIds.entries()) {
      await client.query("insert into researcher_procedures (researcher_id, procedure_id, position) values ($1, $2, $3)", [rows[0].id, procedureId, position]);
    }
    await client.query("commit");
    return (await pool.query<Researcher>(`${select} where r.id = $1`, [rows[0].id])).rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export function researchersRouter(pool: pg.Pool) {
  const router = express.Router();

  router.get("/researchers", async (_request, response) => {
    response.json(await listResearchers(pool));
  });

  router.post("/researchers", async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    response.status(201).json(await save(pool, null, parsed.data));
  });

  router.put("/researchers/:id", async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    response.json(await save(pool, Number(request.params.id), parsed.data));
  });

  router.delete("/researchers/:id", async (request, response) => {
    await pool.query("delete from researchers where id = $1", [Number(request.params.id)]);
    response.status(204).end();
  });

  return router;
}
