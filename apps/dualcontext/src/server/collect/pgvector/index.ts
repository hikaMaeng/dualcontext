import type pg from "pg";
import type { Material } from "dualcontext_domain/common";
import type { ModelClient } from "../../model/index.js";

const identifier = /^[a-z_][a-z0-9_]*$/;
const candidatePool = 8;

/** 관리자가 입력한 테이블/컬럼 이름은 SQL 에 직접 들어가므로 식별자 형태만 허용한다. */
export function assertIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !identifier.test(value)) throw new Error(`${label} must match ${identifier}`);
  return value;
}

/** Matryoshka 축소: 앞 dim 개를 자르고 다시 정규화한다. 코사인 거리에 쓰는 벡터라 길이를 1로 맞춘다. */
export function reduceMrl(vector: number[], dim: number): number[] {
  const head = vector.slice(0, dim);
  const norm = Math.sqrt(head.reduce((sum, value) => sum + value * value, 0)) || 1;
  return head.map((value) => value / norm);
}

const literal = (vector: number[]) => `[${vector.join(",")}]`;

/**
 * pgvector 조사원(테이블형): 지정한 테이블에서 질의 임베딩과 가까운 행을 가져온다.
 * reducedColumn 이 있으면 2단계로 찾는다: 축소 차원 컬럼(HNSW 인덱스)으로 후보를 topK×8 개 뽑고,
 * 전체 차원 컬럼으로 재순위화해 topK 개를 돌려준다. 없으면 전체 차원 컬럼만 쓴다.
 * 질의 임베딩은 AI 서버 설정의 임베딩 모델로 만든다(테이블의 벡터와 같은 모델이어야 한다).
 */
export async function collectPgvector(pool: pg.Pool, model: ModelClient, config: Record<string, unknown>, query: string): Promise<Material[]> {
  const table = assertIdentifier(config.table, "table");
  const vectorColumn = assertIdentifier(config.vectorColumn, "vectorColumn");
  const textColumn = assertIdentifier(config.textColumn, "textColumn");
  const titleColumn = config.titleColumn ? assertIdentifier(config.titleColumn, "titleColumn") : null;
  const reducedColumn = config.reducedColumn ? assertIdentifier(config.reducedColumn, "reducedColumn") : null;
  const topK = Number(config.topK ?? 3);

  const [full] = await model.embed([query]);
  const titleSql = titleColumn ? `"${titleColumn}"::text` : `'${table}'`;
  const from = `"public"."${table}"`;

  if (!reducedColumn) {
    const { rows } = await pool.query<Material>(
      `select ${titleSql} as title, left("${textColumn}"::text, 600) as text from ${from} order by "${vectorColumn}" <=> $1::vector limit $2`,
      [literal(full), topK]
    );
    return rows;
  }

  const reducedDim = Number(config.reducedDim);
  if (!Number.isInteger(reducedDim) || reducedDim < 1 || reducedDim > full.length) throw new Error("reducedDim must be an integer within the embedding size");
  const { rows } = await pool.query<Material>(
    `select title, text from (
       select ${titleSql} as title, left("${textColumn}"::text, 600) as text, "${vectorColumn}" as full_vector
         from ${from} order by "${reducedColumn}" <=> $1::vector limit $3
     ) candidates order by full_vector <=> $2::vector limit $4`,
    [literal(reduceMrl(full, reducedDim)), literal(full), topK * candidatePool, topK]
  );
  return rows;
}
