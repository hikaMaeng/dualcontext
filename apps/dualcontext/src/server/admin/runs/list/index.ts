import type pg from "pg";
import type { RunListItem, RunListPage } from "dualcontext_domain/common";
import type { ModelClient } from "../../../model/index.js";
import { backfillInBackground, requestBackfillLimit } from "../embedding/index.js";
import type { ListParams } from "./params/index.js";
import { buildListQueries, type Semantic } from "./query/index.js";
import { minSimilarity } from "./semantic/index.js";

/** 의미 검색에 필요한 질의 임베딩을 얻지 못했다. 라우터가 503 으로 돌려준다. */
export class EmbeddingUnavailable extends Error {}

type Row = Omit<RunListItem, "match"> & { score: number | null };

/**
 * 목록 한 쪽과 전체 건수를 읽는다. mode=semantic 이고 q 가 있으면 q 를 임베딩해 코사인 유사도로 거르고 정렬한다.
 * 임베딩 서버가 실패하면 빈 결과로 돌려주지 않고 EmbeddingUnavailable 을 던진다.
 */
export async function listRuns(pool: pg.Pool, model: Pick<ModelClient, "embed" | "settings">, params: ListParams): Promise<RunListPage> {
  let semantic: Semantic | undefined;
  if (params.mode === "semantic" && params.q !== "") {
    try {
      const key = (await model.settings()).embedding.model;
      const [vector] = await model.embed([params.q]);
      if (!vector?.length) throw new Error("embedding server returned no vector");
      semantic = { vector, embeddingKey: key, minSimilarity };
    } catch (caught) {
      throw new EmbeddingUnavailable(`embedding server unavailable: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
    // 아직 임베딩이 없는 옛 행은 이번 응답에서는 빠지고, 뒤에서 조금씩 채워 다음 검색부터 잡힌다.
    backfillInBackground(pool, model, requestBackfillLimit);
  }

  const queries = buildListQueries(params, semantic);
  const [{ rows }, counted] = await Promise.all([pool.query<Row>(queries.page.text, queries.page.values), pool.query<{ total: number }>(queries.count.text, queries.count.values)]);
  const by = semantic ? "semantic" : "keyword";
  const items = rows.map(({ score, ...item }): RunListItem => (params.q !== "" && score !== null ? { ...item, match: { by, score } } : item));
  return { items, total: counted.rows[0].total, page: params.page, pageSize: params.pageSize };
}
