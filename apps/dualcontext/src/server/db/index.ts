import pg from "pg";

export type DatabaseStatus = {
  postgres: string;
  pgvector: string | null;
  textsearchKo: string | null;
  koreanConfig: boolean;
  koreanSample: string | null;
};

const positiveInt = (name: string, fallback: number): number => {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

/**
 * 작업 풀. 기본 10(DUALCONTEXT_DB_POOL): 실행의 진행 · 노드 · 라우팅 · 검색이 함께 쓴다. 풀이 포화되어도 연결 대기는 무한하지 않다(connectionTimeoutMillis).
 * 풀 오류(유휴 연결 끊김 등)는 프로세스를 죽이지 않고 기록만 한다.
 */
export function createPool(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: positiveInt("DUALCONTEXT_DB_POOL", 10), connectionTimeoutMillis: 10_000 });
  pool.on("error", (error) => console.error("database pool error", error.message));
  return pool;
}

/** 헬스체크 전용 풀: 작업 풀이 포화되어도 `/health` 가 줄을 서서 컨테이너가 unhealthy 로 판정되는 일이 없게 따로 둔다. */
export function createHealthPool(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 2_000 });
  pool.on("error", (error) => console.error("database health pool error", error.message));
  return pool;
}

export async function pingDatabase(pool: pg.Pool): Promise<boolean> {
  await pool.query("select 1");
  return true;
}

/**
 * Reports what the single-container database actually has installed. The Korean
 * sample is produced by the database itself, so a missing mecab dictionary or
 * extension shows up here instead of at the first real search.
 */
export async function readDatabaseStatus(pool: pg.Pool): Promise<DatabaseStatus> {
  const { rows } = await pool.query<{
    postgres: string;
    pgvector: string | null;
    textsearch_ko: string | null;
    korean_config: boolean;
  }>(`
    select current_setting('server_version') as postgres,
           (select extversion from pg_extension where extname = 'vector') as pgvector,
           (select extversion from pg_extension where extname = 'textsearch_ko') as textsearch_ko,
           exists (select 1 from pg_ts_config where cfgname = 'korean') as korean_config
  `);
  const row = rows[0];
  const koreanSample = row.korean_config
    ? (await pool.query<{ sample: string }>("select to_tsvector('korean', '한국어 형태소 검색')::text as sample")).rows[0].sample
    : null;

  return {
    postgres: row.postgres,
    pgvector: row.pgvector,
    textsearchKo: row.textsearch_ko,
    koreanConfig: row.korean_config,
    koreanSample
  };
}
