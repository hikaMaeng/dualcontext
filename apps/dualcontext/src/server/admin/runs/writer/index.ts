import type pg from "pg";

/** 실행 소유 쓰기가 쓰는 최소 인터페이스(풀 또는 RunWriter). */
export type Queryable = Pick<pg.Pool, "query">;

/**
 * 실행 소유 DB 쓰기의 단일 관문. close() 이후에는 **새 SQL 을 발행하지 않는다**(저장기 · 진행 기록 · 부수 작업이 종료 뒤에 쓰지 못한다).
 * 이미 발행된 SQL 이 늦게 끝나는 경우는 모든 실행 소유 UPDATE/UPSERT 의 `status = 'running'` 조건이 막는다(종료 상태를 덮지 못한다).
 * 키: 실행 하나. 수명: execute 한 번.
 */
export type RunWriter = Queryable & { close(): void; readonly closed: boolean };

export function createRunWriter(pool: Queryable): RunWriter {
  let closed = false;
  const query = ((...args: unknown[]) => (closed ? Promise.resolve({ rows: [], rowCount: 0 }) : (pool.query as (...a: unknown[]) => unknown)(...args))) as pg.Pool["query"];
  return {
    query,
    close() {
      closed = true;
    },
    get closed() {
      return closed;
    }
  };
}
