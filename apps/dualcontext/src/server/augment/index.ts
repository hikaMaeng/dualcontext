import type pg from "pg";
import { augmentQuery, type AugmentPorts } from "dualcontext_domain/server";
import { listProceduresOf } from "../admin/procedures/index.js";
import { listResearchers } from "../admin/researchers/index.js";
import { collect } from "../collect/index.js";
import type { ModelClient } from "../model/index.js";
import { createSelectors } from "../routing/index.js";
import { createWriter, loadWriter } from "../writer/index.js";

/** 서버가 가진 의존성 묶음. MCP 도구와 관리자 API 가 같은 것을 쓴다. */
export type Deps = { pool: pg.Pool; model: ModelClient; dataDir: string };

/** MCP 도구와 관리자 시험 실행이 같은 증강 경로를 쓰도록 포트를 한 곳에서 채운다. */
export async function augment(deps: Deps, query: string, writerId?: number) {
  const selectors = createSelectors(deps.pool, deps.model);
  const ports: AugmentPorts = {
    listResearchers: () => listResearchers(deps.pool),
    listProceduresOf: (researcher) => listProceduresOf(deps.pool, researcher.id),
    split: selectors.split,
    selectResearchers: selectors.selectResearchers,
    selectProcedures: selectors.selectProcedures,
    collect: (researcher, text) => collect(deps.pool, deps.model, deps.dataDir, researcher, text),
    writer: createWriter(deps.model, await loadWriter(deps.pool, writerId))
  };
  return augmentQuery(query, ports);
}
