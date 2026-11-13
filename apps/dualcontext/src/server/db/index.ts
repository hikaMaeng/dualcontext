import pg from "pg";

export type DatabaseStatus = {
  postgres: string;
  pgvector: string | null;
  textsearchKo: string | null;
  koreanConfig: boolean;
  koreanSample: string | null;
};

export function createPool(databaseUrl: string) {
  return new pg.Pool({ connectionString: databaseUrl, max: 4 });
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
