import type { ListParams } from "../params/index.js";

/** 의미 검색에 필요한 값. 질의 임베딩과, 비교 대상 행을 같은 모델의 것으로 좁히는 키(모델 이름). */
export type Semantic = { vector: number[]; embeddingKey: string; minSimilarity: number };

export type Built = { text: string; values: unknown[] };

/**
 * 목록 SQL 을 만든다. 사용자 값은 전부 $n 파라미터로만 들어가고 SQL 문장에는 고정 문자열만 있다.
 * 필터는 종류 안에서 OR(배열 겹침), 종류 사이와 검색어와는 AND 다. page 와 count 는 같은 where 를 쓴다.
 * semantic 을 주면 params.q 는 무시하고 유사도로 거른다·정렬한다(호출자가 q 가 있을 때만 준다).
 */
export function buildListQueries(params: ListParams, semantic?: Semantic): { page: Built; count: Built } {
  const values: unknown[] = [];
  const bind = (value: unknown) => values.push(value) && `$${values.length}`;
  const where: string[] = [];
  let score = "null::float8";
  let order = "id desc";

  if (params.researchers.length > 0) where.push(`researcher_names && ${bind(params.researchers)}::text[]`);
  if (params.procedures.length > 0) where.push(`procedure_names && ${bind(params.procedures)}::text[]`);

  if (semantic) {
    // 차원이 다른 행은 벡터 연산이 오류가 되므로 CASE 로 먼저 거른다(WHERE 항의 평가 순서는 보장되지 않는다).
    const vector = bind(JSON.stringify(semantic.vector));
    const dims = bind(semantic.vector.length);
    const similarity = `case when array_length(query_embedding, 1) = ${dims}::int then 1 - (query_embedding::vector <=> ${vector}::vector) end`;
    where.push(`embedding_key = ${bind(semantic.embeddingKey)}`);
    where.push(`${similarity} >= ${bind(semantic.minSimilarity)}::float8`);
    score = similarity;
    order = "score desc, id desc";
  } else if (params.q !== "") {
    const tsquery = `plainto_tsquery('korean', ${bind(params.q)})`;
    where.push(`search_tsv @@ ${tsquery}`);
    score = `ts_rank(search_tsv, ${tsquery})`;
  }

  const clause = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const filterValues = [...values];
  const limit = bind(params.pageSize);
  const offset = bind((params.page - 1) * params.pageSize);
  return {
    page: {
      text: `select id, created_at as "createdAt", query, status, duration_ms as "durationMs", source,
                    researcher_names as researchers, procedure_names as procedures, ${score} as score
               from augment_runs ${clause} order by ${order} limit ${limit} offset ${offset}`,
      values
    },
    count: { text: `select count(*)::int as total from augment_runs ${clause}`, values: filterValues }
  };
}
