import type pg from "pg";
import type { Material } from "dualcontext_domain/common";
import type { ModelClient } from "../../model/index.js";
import { raceAbort, throwIfAborted } from "../abort/index.js";
import { excerpt } from "./excerpt.js";
import { extractIdentifiers, likePattern } from "./identifiers.js";

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

/** 표기 하나가 이만큼보다 많은 행에 걸리면 식별자가 아니라 흔한 말로 보고 버린다. */
const maxLiteralHits = 5;
/** 식별자 일치 행은 벡터 결과 앞에 붙는다. 합쳐서 topK 보다 이만큼까지만 더 싣는다. */
const maxExtraIdentifierRows = 3;

type Target = { from: string; titleSql: string; textColumn: string; idColumn: string | null; snippetChars: number };

/**
 * 질의에 적힌 식별자(CVE ID, 모델명, 「질문 61」 같은 번호)를 문자열로 정확히 찾는다. 임베딩이 놓치는 경우를 메운다(실행 로그 #25).
 * 인덱스가 없는 순차 검색이라 행이 수천 개 이하인 테이블용이다. 큰 테이블은 config.identifierSearch=false 로 끈다.
 */
export async function findByIdentifiers(pool: pg.Pool, target: Target, query: string, signal?: AbortSignal): Promise<Material[]> {
  const { literals, refs } = extractIdentifiers(query);
  const found: Material[] = [];
  const seen = new Set<string>();
  const push = (rows: { title: string; text: string }[]) => {
    for (const row of rows) {
      if (seen.has(row.title)) continue;
      seen.add(row.title);
      found.push({ title: row.title, text: excerpt(row.text, target.snippetChars), match: "identifier" });
    }
  };
  const select = `select ${target.titleSql} as title, left("${target.textColumn}"::text, $2) as text from ${target.from}`;
  for (const value of literals) {
    throwIfAborted(signal);
    const { rows } = await raceAbort(
      pool.query<{ title: string; text: string }>(
        `${select} where ${target.titleSql} ilike $1 or "${target.textColumn}"::text ilike $1 limit ${maxLiteralHits + 1}`,
        [likePattern(value), target.snippetChars + 1]
      ),
      signal
    );
    if (rows.length <= maxLiteralHits) push(rows);
  }
  if (target.idColumn) {
    for (const ref of refs) {
      throwIfAborted(signal);
      const { rows } = await raceAbort(
        pool.query<{ title: string; text: string }>(`${select} where "${target.idColumn}"::text = $1 or "${target.idColumn}"::text like $3 limit 2`, [ref, target.snippetChars + 1, `%/${ref}`]),
        signal
      );
      push(rows);
    }
  }
  return found;
}

/** 식별자 일치 행을 앞에 두고 벡터 결과를 이어 붙인다(같은 제목은 한 번만). */
export function mergeIdentifierRows(exact: Material[], vector: Material[], topK: number): Material[] {
  const titles = new Set(exact.map((material) => material.title));
  return [...exact, ...vector.filter((material) => !titles.has(material.title))].slice(0, topK + Math.min(exact.length, maxExtraIdentifierRows));
}

/**
 * pgvector 조사원(테이블형): 지정한 테이블에서 질의 임베딩과 가까운 행을 가져온다.
 * reducedColumn 이 있으면 2단계로 찾는다: 축소 차원 컬럼(HNSW 인덱스)으로 후보를 topK×8 개 뽑고,
 * 전체 차원 컬럼으로 재순위화해 topK 개를 돌려준다. 없으면 전체 차원 컬럼만 쓴다.
 * 질의 임베딩은 AI 서버 설정의 임베딩 모델로 만든다(테이블의 벡터와 같은 모델이어야 한다).
 */
export async function collectPgvector(pool: pg.Pool, model: ModelClient, config: Record<string, unknown>, query: string, signal?: AbortSignal, precomputed?: number[]): Promise<Material[]> {
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

  const idColumn = config.idColumn ? assertIdentifier(config.idColumn, "idColumn") : null;
  const identifierSearch = config.identifierSearch !== false;

  // 임베딩 호출은 모델 층(큐 · 신호)이 취소를 다룬다. 이 아래의 DB 쿼리는 취소할 수 없으므로 `raceAbort` 로 기다림만 끝낸다.
  // 호출자가 질의 임베딩을 미리 만들어 주면(수집 큐 밖에서) 그것을 쓴다: 이 함수는 DB 조회만 한다.
  const full = precomputed ?? (await raceAbort(model.embed([query]), signal))[0];
  const titleSql = titleColumn ? `"${titleColumn}"::text` : `'${table}'`;
  const from = `"public"."${table}"`;

  const withIdentifiers = async (vector: Material[]) =>
    identifierSearch ? mergeIdentifierRows(await findByIdentifiers(pool, { from, titleSql, textColumn, idColumn, snippetChars }, query, signal), vector, topK) : vector;

  if (!reducedColumn) {
    const { rows } = await raceAbort(
      pool.query<RawRow>(
        `select ${titleSql} as title, left("${textColumn}"::text, $3) as text, 1 - ("${vectorColumn}" <=> $1::vector) as score from ${from} order by "${vectorColumn}" <=> $1::vector limit $2`,
        [literal(full), topK, snippetChars + 1]
      ),
      signal
    );
    return withIdentifiers(toMaterials(rows, snippetChars, minScore));
  }

  const reducedDim = Number(config.reducedDim);
  if (!Number.isInteger(reducedDim) || reducedDim < 1 || reducedDim > full.length) throw new Error("reducedDim must be an integer within the embedding size");
  const { rows } = await raceAbort(
    pool.query<RawRow>(
      `select title, text, 1 - (full_vector <=> $2::vector) as score from (
       select ${titleSql} as title, left("${textColumn}"::text, $5) as text, "${vectorColumn}" as full_vector
         from ${from} order by "${reducedColumn}" <=> $1::vector limit $3
     ) candidates order by full_vector <=> $2::vector limit $4`,
      [literal(reduceMrl(full, reducedDim)), literal(full), topK * candidatePool, topK, snippetChars + 1]
    ),
    signal
  );
  return withIdentifiers(toMaterials(rows, snippetChars, minScore));
}
