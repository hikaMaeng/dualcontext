import type pg from "pg";
import type { RunFilterOptions } from "dualcontext_domain/common";

/** 실행 기록에 실제로 나온 조사원 · 프로시저 이름(가나다순: 유니코드 코드포인트 순이라 한글 음절은 가나다순이다). 삭제된 조사원이라도 기록에 남아 있으면 포함한다. */
export async function readFilterOptions(pool: pg.Pool): Promise<RunFilterOptions> {
  const { rows } = await pool.query<RunFilterOptions>(
    `select coalesce((select array_agg(n order by n collate "C") from (select distinct unnest(researcher_names) as n from augment_runs) r), '{}') as researchers,
            coalesce((select array_agg(n order by n collate "C") from (select distinct unnest(procedure_names) as n from augment_runs) p), '{}') as procedures`
  );
  return rows[0];
}
