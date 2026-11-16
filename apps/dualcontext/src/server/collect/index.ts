import type pg from "pg";
import type { Material, Researcher } from "dualcontext_domain/common";
import type { ModelClient } from "../model/index.js";
import { collectCodebase } from "./codebase/index.js";
import { collectCrawler } from "./crawler/index.js";
import { collectDuckDuckGo } from "./duckduckgo/index.js";
import { webSearchQuery } from "./duckduckgo/rewrite/index.js";
import { collectFolder } from "./folder/index.js";
import { collectPgvector } from "./pgvector/index.js";

/** 조사원 타입에 맞는 수집기로 보낸다. 새 타입은 collect/<type>/ 폴더를 더하고 여기에 한 줄을 추가한다. */
export function collect(pool: pg.Pool, model: ModelClient, dataDir: string, researcher: Researcher, query: string): Promise<Material[]> {
  switch (researcher.type) {
    case "duckduckgo":
      return collectWeb(model, researcher.config, query);
    case "pgvector":
      return collectPgvector(pool, model, researcher.config, query);
    case "folder":
      return collectFolder(pool, dataDir, researcher.config, query);
    case "codebase":
      return collectCodebase(dataDir, researcher.config, query);
    case "crawler":
      return collectCrawler(pool, model, researcher.id, researcher.config, query);
  }
}

/**
 * 웹 검색: 질의 원문 대신 모델이 웹 검색어로 다시 쓴 문장을 보낸다(config.rewrite 가 false 면 원문).
 * 쓴 검색어가 원문과 다르면 첫 자료 본문 앞에 남겨, 실행 상세에서 무엇을 검색했는지 보이게 한다.
 */
async function collectWeb(model: ModelClient, config: Record<string, unknown>, query: string): Promise<Material[]> {
  const searched = config.rewrite === false ? query : await webSearchQuery((prompt) => model.chat(prompt), query);
  const materials = await collectDuckDuckGo(config, searched);
  const first = materials[0];
  if (first !== undefined && searched !== query) materials[0] = { ...first, text: `(검색어: ${searched}) ${first.text}` };
  return materials;
}
