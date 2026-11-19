import { createHash } from "node:crypto";
import type pg from "pg";
import { chunkMarkdown } from "../chunk/index.js";
import { limits, type CrawlerConfig } from "../config/index.js";
import type { CrawledPage } from "../walk/index.js";

export { embedPending } from "./embed.js";
export { cosine, rankHits, searchChunks, searchParams, searchSql, searchTimeoutMs, type Hit } from "./search.js";

export type CrawlState = {
  fingerprint: string;
  status: "idle" | "running" | "ok" | "error";
  startedAt: Date | null;
  finishedAt: Date | null;
  pages: number;
  chunks: number;
  error: string | null;
};

export async function readState(pool: pg.Pool, researcherId: number): Promise<CrawlState | null> {
  const { rows } = await pool.query(
    `select fingerprint, status, started_at as "startedAt", finished_at as "finishedAt", pages, chunks, error from crawl_state where researcher_id = $1`,
    [researcherId]
  );
  return rows[0] ?? null;
}

export async function markRunning(pool: pg.Pool, researcherId: number, fingerprint: string): Promise<void> {
  await pool.query(
    `insert into crawl_state (researcher_id, fingerprint, status, started_at) values ($1, $2, 'running', now())
     on conflict (researcher_id) do update set status = 'running', started_at = now(), error = null,
       fingerprint = excluded.fingerprint`,
    [researcherId, fingerprint]
  );
}

export async function markFailed(pool: pg.Pool, researcherId: number, message: string): Promise<void> {
  await pool.query(`update crawl_state set status = 'error', finished_at = now(), error = $2 where researcher_id = $1`, [researcherId, message.slice(0, 500)]);
}

/**
 * 이전 크롤이 다른 대상(지문이 다름)이었다면 캐시를 비운다. 같은 대상이면 그대로 둔다(내용이 안 바뀐 페이지의 임베딩을 재사용하려고).
 */
export async function discardIfFingerprintChanged(pool: pg.Pool, researcherId: number, fingerprint: string): Promise<void> {
  const state = await readState(pool, researcherId);
  if (state !== null && state.fingerprint !== fingerprint) await pool.query("delete from crawl_pages where researcher_id = $1", [researcherId]);
}

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * 크롤 결과를 캐시에 반영한다(한 트랜잭션). 이번에 못 만난 페이지는 지우고, 내용 해시가 같은 페이지는 청크와 임베딩을 그대로 둔다.
 * 청크 총량은 limits.maxChunks 에서 자른다. 한 페이지의 청크는 `unnest` 로 한 번에 넣는다(청크마다 왕복하지 않는다).
 * 반환값은 저장된 페이지·청크 수.
 */
export async function replacePages(pool: pg.Pool, researcherId: number, config: CrawlerConfig, pages: CrawledPage[]): Promise<{ pages: number; chunks: number }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = new Map((await client.query<{ url: string; content_hash: string }>("select url, content_hash from crawl_pages where researcher_id = $1", [researcherId])).rows.map((row) => [row.url, row.content_hash]));
    const kept = new Set<string>();
    let chunkTotal = 0;
    for (const page of pages) {
      const chunks = chunkMarkdown(page.markdown, config.chunkChars);
      if (chunkTotal + chunks.length > limits.maxChunks) break;
      chunkTotal += chunks.length;
      kept.add(page.url);
      const contentHash = hash(page.markdown);
      if (existing.get(page.url) === contentHash) {
        await client.query("update crawl_pages set title = $3, fetched_at = now() where researcher_id = $1 and url = $2", [researcherId, page.url, page.title]);
        continue;
      }
      await client.query(
        `insert into crawl_pages (researcher_id, url, title, content_hash) values ($1, $2, $3, $4)
         on conflict (researcher_id, url) do update set title = excluded.title, content_hash = excluded.content_hash, fetched_at = now()`,
        [researcherId, page.url, page.title, contentHash]
      );
      await client.query("delete from crawl_chunks where researcher_id = $1 and url = $2", [researcherId, page.url]);
      if (chunks.length > 0) {
        await client.query("insert into crawl_chunks (researcher_id, url, idx, text) select $1, $2, u.idx, u.text from unnest($3::int[], $4::text[]) as u(idx, text)", [
          researcherId,
          page.url,
          chunks.map((chunk) => chunk.index),
          chunks.map((chunk) => chunk.text)
        ]);
      }
    }
    await client.query("delete from crawl_pages where researcher_id = $1 and not (url = any($2::text[]))", [researcherId, [...kept]]);
    const counts = (await client.query<{ chunks: string }>("select count(*) as chunks from crawl_chunks where researcher_id = $1", [researcherId])).rows[0];
    await client.query(
      `update crawl_state set status = 'ok', finished_at = now(), pages = $2, chunks = $3, error = null where researcher_id = $1`,
      [researcherId, kept.size, Number(counts.chunks)]
    );
    await client.query("commit");
    return { pages: kept.size, chunks: Number(counts.chunks) };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
