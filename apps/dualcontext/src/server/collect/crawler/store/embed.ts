import type pg from "pg";
import { assertVector, type PinnedEmbedder } from "../embedding/index.js";

const embedBatch = 32;
/** 백필 한 번의 총 시간 상한(공유 작업의 자기 시한). 넘으면 거기서 멈추고 나머지는 다음 호출이 이어서 채운다. */
const embedDeadlineMs = 15 * 60_000;

/**
 * 진행 중인 백필: 키 = (조사원 id, 임베딩 모델), 범위 = 프로세스, 같은 키의 동시 호출은 한 번의 백필을 기다린다.
 * 끝나면(성공 · 실패) 만든 쪽이 지운다. 크기는 조사원 수 × 동시에 쓰이는 모델 수 이하다.
 * 공유 작업이므로 호출자의 취소 신호로 죽지 않는다: 호출자는 `raceAbort` 로 기다림에서만 떨어진다.
 */
const flights = new Map<string, Promise<number>>();

/**
 * 임베딩이 없거나 다른 모델로 만들어진 청크를 고정한 임베딩 설정(`embedder`)으로 채운다.
 * 청크 UPDATE 는 읽은 텍스트와 같을 때만 적용한다(`and text = $6`): 백필하는 동안 페이지가 다시 크롤돼 텍스트가 바뀐 청크에
 * 옛 텍스트의 벡터가 붙지 않는다. 벡터는 저장 전에 검증한다(1차원 · 유한값 · float32 범위).
 */
export function embedPending(pool: pg.Pool, embedder: PinnedEmbedder, researcherId: number): Promise<number> {
  const key = `${researcherId}\u0000${embedder.key}`;
  const running = flights.get(key);
  if (running !== undefined) return running;
  const job = backfill(pool, embedder, researcherId).finally(() => flights.delete(key));
  flights.set(key, job);
  return job;
}

async function backfill(pool: pg.Pool, embedder: PinnedEmbedder, researcherId: number): Promise<number> {
  const deadline = Date.now() + embedDeadlineMs;
  const { rows } = await pool.query<{ url: string; idx: number; text: string }>(
    "select url, idx, text from crawl_chunks where researcher_id = $1 and (embedding is null or embedding_key is distinct from $2) order by url, idx",
    [researcherId, embedder.key]
  );
  for (let at = 0; at < rows.length; at += embedBatch) {
    if (Date.now() > deadline) throw new Error("embedding backfill time limit exceeded");
    const batch = rows.slice(at, at + embedBatch);
    const vectors = await embedder.embed(batch.map((row) => row.text));
    if (vectors.length !== batch.length) throw new Error(`embedding server returned ${vectors.length} vectors for ${batch.length} inputs`);
    for (const [i, row] of batch.entries()) {
      const vector = vectors[i];
      assertVector(vector, `embedding of ${row.url}#${row.idx}`);
      await pool.query("update crawl_chunks set embedding = $4, embedding_key = $5 where researcher_id = $1 and url = $2 and idx = $3 and text = $6", [researcherId, row.url, row.idx, vector, embedder.key, row.text]);
    }
  }
  return rows.length;
}
