import type pg from "pg";
import { augmentQuery, type AugmentPorts } from "dualcontext_domain/server";
import { collectDocuments } from "../admin/documents/index.js";
import { listProcedures } from "../admin/procedures/index.js";
import { listResearchers } from "../admin/researchers/index.js";

/** MCP 도구와 관리자 시험 화면이 같은 증강 경로를 쓰도록 포트를 한 곳에서 채운다. */
export function augment(pool: pg.Pool, query: string) {
  const ports: AugmentPorts = {
    listResearchers: () => listResearchers(pool),
    listProcedures: (researcherId) => listProcedures(pool, researcherId),
    collect: (researcher, text) => collectDocuments(pool, researcher, text)
  };
  return augmentQuery(query, ports);
}
