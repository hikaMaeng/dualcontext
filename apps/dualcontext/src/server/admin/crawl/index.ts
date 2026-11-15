import express from "express";
import type { Researcher } from "dualcontext_domain/common";
import type { Deps } from "../../augment/index.js";
import { crawlStatus, startCrawl } from "../../collect/crawler/index.js";

/**
 * 크롤러 조사원의 캐시 관리. 크롤은 오래 걸리므로 시작은 비동기(202)이고 진행은 상태 조회로 본다.
 * 캐시 지우기는 조사원 행은 그대로 두고 크롤한 페이지·조각만 비운다.
 */
export function crawlRouter({ pool, model }: Deps) {
  const router = express.Router();

  async function crawlerOf(id: number): Promise<Researcher | null> {
    const { rows } = await pool.query<Researcher>("select id, config, type from researchers where id = $1 and type = 'crawler'", [id]);
    return rows[0] ?? null;
  }

  router.get("/researchers/:id/crawl", async (request, response) => {
    const id = Number(request.params.id);
    if (!(await crawlerOf(id))) return void response.status(404).json({ error: "not a crawler researcher" });
    response.json(await crawlStatus(pool, id));
  });

  router.post("/researchers/:id/crawl", async (request, response) => {
    const id = Number(request.params.id);
    const researcher = await crawlerOf(id);
    if (!researcher) return void response.status(404).json({ error: "not a crawler researcher" });
    try {
      await startCrawl(pool, model, id, researcher.config);
    } catch (error) {
      return void response.status(400).json({ error: (error as Error).message });
    }
    response.status(202).json({ status: "running" });
  });

  router.delete("/researchers/:id/crawl", async (request, response) => {
    const id = Number(request.params.id);
    if (!(await crawlerOf(id))) return void response.status(404).json({ error: "not a crawler researcher" });
    if ((await crawlStatus(pool, id)).running) return void response.status(409).json({ error: "crawl is running" });
    await pool.query("delete from crawl_pages where researcher_id = $1", [id]);
    await pool.query("delete from crawl_state where researcher_id = $1", [id]);
    response.status(204).end();
  });

  return router;
}
