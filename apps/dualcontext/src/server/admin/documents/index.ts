import express from "express";
import type pg from "pg";
import { z } from "zod";
import type { Material, Researcher } from "dualcontext_domain/common";

const body = z.object({
  researcherId: z.number().int(),
  title: z.string().trim().min(1),
  body: z.string().min(1)
});

/**
 * 문서 연구원의 수집: 질의를 한국어 형태소로 나눠 OR 로 묶어 전문 검색한다.
 * plainto_tsquery 는 모든 단어를 AND 로 묶어 자연어 질문에서 거의 0건이 되므로 | 로 바꾼다.
 * 임베딩 모델을 아직 붙이지 않았으므로 pgvector 는 쓰지 않는다.
 */
export async function collectDocuments(pool: pg.Pool, researcher: Researcher, query: string): Promise<Material[]> {
  const { rows } = await pool.query<Material>(
    `with q as (select replace(plainto_tsquery('korean', $2)::text, '&', '|')::tsquery as tsq)
     select d.title, left(d.body, 600) as text
       from documents d, q
      where d.researcher_id = $1 and to_tsvector('korean', d.title || ' ' || d.body) @@ q.tsq
      order by ts_rank(to_tsvector('korean', d.title || ' ' || d.body), q.tsq) desc
      limit 3`,
    [researcher.id, query]
  );
  return rows;
}

export function documentsRouter(pool: pg.Pool) {
  const router = express.Router();

  router.get("/documents", async (_request, response) => {
    const { rows } = await pool.query(
      `select id, researcher_id as "researcherId", title, left(body, 200) as excerpt from documents order by id`
    );
    response.json(rows);
  });

  router.post("/documents", async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: parsed.error.message });
    const d = parsed.data;
    const { rows } = await pool.query(
      `insert into documents (researcher_id, title, body) values ($1, $2, $3)
       returning id, researcher_id as "researcherId", title`,
      [d.researcherId, d.title, d.body]
    );
    response.status(201).json(rows[0]);
  });

  router.delete("/documents/:id", async (request, response) => {
    await pool.query("delete from documents where id = $1", [Number(request.params.id)]);
    response.status(204).end();
  });

  return router;
}
