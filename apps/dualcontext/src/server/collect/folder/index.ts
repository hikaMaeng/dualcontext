import { readdir, readFile, stat } from "node:fs/promises";
// 서버는 리눅스 컨테이너에서만 돈다. 경로 규칙을 posix 로 고정해 호스트 OS 와 무관하게 같은 검증을 한다.
import { posix as path } from "node:path";
import type pg from "pg";
import type { Material } from "dualcontext_domain/common";
import { raceAbort, throwIfAborted } from "../abort/index.js";
import { withStatementTimeout } from "../timeout/index.js";
import { budgetFor, type ByteBudget } from "./budget.js";

const textExtensions = new Set([".txt", ".md", ".markdown", ".csv", ".log"]);
const maxFiles = 300;
const maxBytes = 1_000_000;

/**
 * 볼륨 안의 폴더 경로를 검증해 절대 경로로 바꾼다. 볼륨 밖으로 나가는 경로(..)와
 * 데이터베이스 자신의 폴더(pgdata)는 거부한다.
 */
export function resolveVolumeFolder(dataDir: string, relative: unknown): string {
  if (typeof relative !== "string" || relative.trim() === "") throw new Error("folder path is empty");
  const absolute = path.resolve(dataDir, relative);
  const inside = path.relative(dataDir, absolute);
  if (inside === "" || inside.startsWith("..") || path.isAbsolute(inside)) throw new Error("folder must be inside the volume");
  if (inside.split(path.sep)[0] === "pgdata") throw new Error("pgdata is the database's own folder");
  return absolute;
}

async function listTextFiles(folder: string, signal: AbortSignal | undefined): Promise<string[]> {
  const found: string[] = [];
  const stack = [folder];
  while (stack.length > 0 && found.length < maxFiles) {
    throwIfAborted(signal);
    const current = stack.pop() as string;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())) found.push(full);
    }
  }
  return found.slice(0, maxFiles);
}

/**
 * 파일을 읽는다. 파일 사이마다 취소를 확인하고, 실행 단위 총 바이트 예산(`budget`)이 남은 만큼만 읽는다:
 * 예산보다 큰 파일은 건너뛰고(작은 파일은 계속 읽는다) 읽은 바이트는 예산에서 뺀다. 파일 하나는 1MB 이하만 읽는다.
 */
async function readBodies(folder: string, files: string[], budget: ByteBudget, signal: AbortSignal | undefined): Promise<{ names: string[]; bodies: string[] }> {
  const names: string[] = [];
  const bodies: string[] = [];
  for (const file of files) {
    throwIfAborted(signal);
    const size = (await stat(file)).size;
    if (size > maxBytes || size > budget.remaining) continue;
    budget.remaining -= size;
    names.push(path.relative(folder, file));
    bodies.push(await readFile(file, "utf8"));
  }
  return { names, bodies };
}

/**
 * 폴더 조사원: 지정한 볼륨 폴더 안의 텍스트 파일 전체를 검색 대상으로 삼는다.
 * 파일은 질의 때마다 읽고(한 실행의 폴더 조사원들이 합쳐 20MB 까지), 순위는 데이터베이스의 한국어 전문 검색으로 매긴다.
 * 검색 쿼리는 체크아웃한 연결의 `SET LOCAL statement_timeout`(30초) 안에서 돈다. `signal` 은 이 실행의 취소 신호다.
 */
export async function collectFolder(pool: pg.Pool, dataDir: string, config: Record<string, unknown>, query: string, signal?: AbortSignal): Promise<Material[]> {
  const folder = resolveVolumeFolder(dataDir, config.path);
  const topK = Number(config.topK ?? 3);
  const { names, bodies } = await readBodies(folder, await listTextFiles(folder, signal), budgetFor(signal), signal);
  if (names.length === 0) return [];
  throwIfAborted(signal);

  const { rows } = await raceAbort(
    withStatementTimeout(pool, (client) =>
      client.query<Material>(
        `with q as (select replace(plainto_tsquery('korean', $1)::text, '&', '|')::tsquery as tsq),
          f as (select * from unnest($2::text[], $3::text[]) as t(name, body))
     select f.name as title,
            ts_headline('korean', f.body, q.tsq, 'MaxWords=60, MinWords=20, MaxFragments=2') as text
       from f, q
      where to_tsvector('korean', f.body) @@ q.tsq
      order by ts_rank(to_tsvector('korean', f.body), q.tsq) desc
      limit $4`,
        [query, names, bodies, topK]
      )
    ),
    signal
  );
  return rows;
}
