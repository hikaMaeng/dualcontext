import type pg from "pg";

/** 오래 걸릴 수 있는 쿼리(크롤러 검색 · 폴더 검색)의 시한(ms). */
export const statementTimeoutMs = 30_000;

/**
 * 시한을 건 한 연결에서 실행한다: `begin; set local statement_timeout = 30000; …; commit`.
 * 시한은 세션이 아니라 체크아웃한 연결의 트랜잭션 안(`SET LOCAL`)에만 걸리므로 풀의 다른 쿼리에 새지 않는다.
 * 실패하면 롤백하고 연결을 돌려준다.
 */
export async function withStatementTimeout<T>(pool: pg.Pool, run: (client: pg.PoolClient) => Promise<T>, timeoutMs: number = statementTimeoutMs): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local statement_timeout = ${Math.trunc(timeoutMs)}`);
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
