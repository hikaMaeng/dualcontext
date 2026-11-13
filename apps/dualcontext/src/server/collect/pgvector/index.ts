import type pg from "pg";
import type { Material } from "dualcontext_domain/common";
import type { ModelClient } from "../../model/index.js";
import { excerpt } from "./excerpt.js";

const identifier = /^[a-z_][a-z0-9_]*$/;
const candidatePool = 8;
const defaultSnippetChars = 1200;
/**
 * 자료(행) 단위 관련도 기준: 질의와의 코사인 유사도가 이보다 낮은 행은 버린다. 조사원 라우팅은 설명 문구와 질의를 비교할 뿐이라
 * 조사원이 맞아도 실제 행은 무관할 수 있기 때문이다(실행 로그 #36: 소프트웨어 개발 조사원이 육아 질의에 SO 질문을 가져옴).
 * 값은 embeddinggemma 기준 측정이다(test/20261113/material-relevance_result.json): 관련 20건 최저 0.7524, 부분 12건 최저 0.7332,
 * 무관 36건 중 25건이 0.72 미만. 임베딩 모델을 바꾸면 다시 재야 한다. 0 으로 두면 거르지 않는다.
 */
const defaultMinScore = 0.72;

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

type RawRow = { title: string; text: string; score: number };

/** 관련도 기준 미달 행을 버리고, 본문을 문장 경계에서 자르고, 점수를 붙여 돌려준다. */
export function toMaterials(rows: RawRow[], snippetChars: number, minScore: number): Material[] {
  return rows
    .filter((row) => Number(row.score) >= minScore)
    .map((row) => ({ title: row.title, text: excerpt(row.text, snippetChars), score: Number(Number(row.score).toFixed(4)) }));
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
  // 컨텍스트에 싣는 자료 길이. 600자로 자르면 검색은 맞았는데 정답 문장이 잘려 사라지는 일이 있었다(실험 F1·F3).
  const snippetChars = Number(config.snippetChars ?? defaultSnippetChars);
  if (!Number.isInteger(snippetChars) || snippetChars < 100 || snippetChars > 8000) throw new Error("snippetChars must be an integer from 100 to 8000");
  const minScore = Number(config.minScore ?? defaultMinScore);
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) throw new Error("minScore must be a number from 0 to 1");

  const [full] = await model.embed([query]);
  const titleSql = titleColumn ? `"${titleColumn}"::text` : `'${table}'`;
  const from = `"public"."${table}"`;

  if (!reducedColumn) {
    const { rows } = await pool.query<RawRow>(
      `select ${titleSql} as title, left("${textColumn}"::text, $3) as text, 1 - ("${vectorColumn}" <=> $1::vector) as score from ${from} order by "${vectorColumn}" <=> $1::vector limit $2`,
      [literal(full), topK, snippetChars + 1]
    );
    return toMaterials(rows, snippetChars, minScore);
  }

  const reducedDim = Number(config.reducedDim);
  if (!Number.isInteger(reducedDim) || reducedDim < 1 || reducedDim > full.length) throw new Error("reducedDim must be an integer within the embedding size");
  const { rows } = await pool.query<RawRow>(
    `select title, text, 1 - (full_vector <=> $2::vector) as score from (
       select ${titleSql} as title, left("${textColumn}"::text, $5) as text, "${vectorColumn}" as full_vector
         from ${from} order by "${reducedColumn}" <=> $1::vector limit $3
     ) candidates order by full_vector <=> $2::vector limit $4`,
    [literal(reduceMrl(full, reducedDim)), literal(full), topK * candidatePool, topK, snippetChars + 1]
  );
  return toMaterials(rows, snippetChars, minScore);
}
