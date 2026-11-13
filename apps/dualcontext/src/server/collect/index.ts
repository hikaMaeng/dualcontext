import type pg from "pg";
import type { Material, Researcher } from "dualcontext_domain/common";
import type { ModelClient } from "../model/index.js";
import { collectDuckDuckGo } from "./duckduckgo/index.js";
import { collectFolder } from "./folder/index.js";
import { collectPgvector } from "./pgvector/index.js";

/** 조사원 타입에 맞는 수집기로 보낸다. 새 타입은 collect/<type>/ 폴더를 더하고 여기에 한 줄을 추가한다. */
export function collect(pool: pg.Pool, model: ModelClient, dataDir: string, researcher: Researcher, query: string): Promise<Material[]> {
  switch (researcher.type) {
    case "duckduckgo":
      return collectDuckDuckGo(researcher.config, query);
    case "pgvector":
      return collectPgvector(pool, model, researcher.config, query);
    case "folder":
      return collectFolder(pool, dataDir, researcher.config, query);
  }
}
