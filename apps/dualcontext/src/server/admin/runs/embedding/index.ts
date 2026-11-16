import type pg from "pg";
import type { ModelClient } from "../../../model/index.js";

/** 시작할 때 백그라운드로 채우는 옛 행의 상한(최근 것부터). 보관 상한 500건과 같아 전부 채운다. */
export const startupBackfillLimit = 500;
/** 의미 검색 요청이 뒤에서 채우는 상한. 요청마다 임베딩 서버를 오래 붙잡지 않도록 작게 둔다. */
export const requestBackfillLimit = 50;
/** 한 번의 임베딩 호출에 묶는 질의 수. */
const batchSize = 16;

type Embedder = Pick<ModelClient, "embed" | "settings">;

/** 이 실행의 질의 임베딩을 계산해 저장한다. 실패해도 던지지 않고 false 를 돌려준다(실행을 막지 않는다). */
export async function embedRunQuery(pool: pg.Pool, model: Embedder, runId: number, query: string): Promise<boolean> {
  try {
    const key = (await model.settings()).embedding.model;
    const [vector] = await model.embed([query]);
    await pool.query("update augment_runs set query_embedding = $2, embedding_key = $3 where id = $1", [runId, vector, key]);
    return true;
  } catch (caught) {
    console.error(`run ${runId}: could not embed the query`, caught instanceof Error ? caught.message : caught);
    return false;
  }
}

/**
 * 임베딩이 없거나 다른 모델로 만든 행(옛 행, 모델 교체 뒤)을 최근 것부터 limit 건까지 채우고 채운 건수를 돌려준다.
 * 배치 단위로 호출하며, 한 배치가 실패하면 거기서 멈춘다(임베딩 서버가 내려가 있으면 건건이 실패하며 시간을 쓰지 않는다).
 */
export async function backfillEmbeddings(pool: pg.Pool, model: Embedder, limit: number): Promise<number> {
  const key = (await model.settings()).embedding.model;
  if (!key) return 0;
  const { rows } = await pool.query<{ id: number; query: string }>(
    "select id, query from augment_runs where embedding_key is distinct from $1 order by id desc limit $2",
    [key, limit]
  );
  let done = 0;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    try {
      const vectors = await model.embed(batch.map((row) => row.query));
      for (const [index, row] of batch.entries()) {
        await pool.query("update augment_runs set query_embedding = $2, embedding_key = $3 where id = $1", [row.id, vectors[index], key]);
        done += 1;
      }
    } catch (caught) {
      console.error("run embedding backfill stopped", caught instanceof Error ? caught.message : caught);
      break;
    }
  }
  return done;
}

/** 백필이 동시에 둘 이상 돌지 않게 하는 표시. 프로세스 하나 안에서만 의미가 있고(서버는 프로세스 하나), 끝나면 스스로 내려간다. */
let backfilling = false;

/** 기다리지 않는 백필. 이미 돌고 있으면 아무것도 하지 않는다. 절대 거부되지 않는다. */
export function backfillInBackground(pool: pg.Pool, model: Embedder, limit: number): void {
  if (backfilling) return;
  backfilling = true;
  backfillEmbeddings(pool, model, limit)
    .catch((caught) => console.error("run embedding backfill failed", caught instanceof Error ? caught.message : caught))
    .finally(() => {
      backfilling = false;
    });
}
