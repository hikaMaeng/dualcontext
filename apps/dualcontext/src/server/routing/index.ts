import { createHash } from "node:crypto";
import type pg from "pg";
import type { Procedure, Researcher, RouterConfig } from "dualcontext_domain/common";
import { routeProceduresByKeyword, routeResearchersByKeyword, type Selection } from "dualcontext_domain/server";
import type { ModelClient } from "../model/index.js";
import { readRouterConfig } from "./config/index.js";
import { runPipeline } from "./pipeline/index.js";
import { splitWithConfig } from "./split/index.js";

export { readRouterConfig } from "./config/index.js";

type Table = "researchers" | "procedures";

export type SelectorOptions = {
  /** 설정을 읽는 방법. 기본은 DB 의 저장된 설정이다. 관리자 라우팅 미리보기는 저장하지 않은 설정을 넘긴다. */
  config?: () => Promise<RouterConfig>;
};

/** 질의 분해와 조사원 라우팅(1단계), 프로시저 라우팅(2단계)을 라우터 설정의 단계 파이프라인대로 수행한다. */
export function createSelectors(pool: pg.Pool, model: ModelClient, options: SelectorOptions = {}) {
  const readConfig = options.config ?? (() => readRouterConfig(pool));

  /** 항목별 임베딩을 DB 에 캐시한다. 글이나 모델이 바뀌면 키가 달라져 다시 계산한다. */
  async function embeddingsFor<T extends { id: number }>(table: Table, items: T[], textOf: (item: T) => string) {
    const modelName = (await model.settings()).embedding.model;
    const keys = items.map((item) => createHash("sha1").update(`${modelName}\n${textOf(item)}`).digest("hex"));
    const { rows } = await pool.query<{ id: number; embedding: number[] | null; embedding_key: string | null }>(
      `select id, embedding, embedding_key from ${table} where id = any($1)`,
      [items.map((item) => item.id)]
    );
    const stored = new Map(rows.map((row) => [row.id, row]));
    const stale = items.map((_item, index) => index).filter((index) => stored.get(items[index].id)?.embedding_key !== keys[index]);
    const fresh = stale.length > 0 ? await model.embed(stale.map((index) => textOf(items[index]))) : [];
    for (const [position, index] of stale.entries()) {
      await pool.query(`update ${table} set embedding = $2, embedding_key = $3 where id = $1`, [items[index].id, fresh[position], keys[index]]);
      stored.set(items[index].id, { id: items[index].id, embedding: fresh[position], embedding_key: keys[index] });
    }
    return items.map((item) => stored.get(item.id)?.embedding ?? []);
  }

  /** 질의 임베딩은 파이프라인 한 번 안에서 한 번만 계산한다. */
  function queryEmbedder(query: string) {
    let pending: Promise<number[]> | undefined;
    return () => (pending ??= model.embed([query]).then(([vector]) => vector));
  }

  return {
    /** 설정의 질의 분해 방법으로 질의를 나눈다. 나눌 곳이 없으면 질의 하나만 담아 돌려준다. */
    async split(query: string): Promise<string[]> {
      return (await splitWithConfig(query, (await readConfig()).split, model)).parts;
    },

    async selectResearchers(query: string, researchers: Researcher[], options: { part?: boolean } = {}): Promise<Selection<Researcher>> {
      const config = await readConfig();
      const candidates = researchers.filter((researcher) => researcher.enabled);
      return runPipeline(
        config.researcher,
        candidates,
        {
          query,
          embedQuery: queryEmbedder(query),
          vectorsOf: (items) => embeddingsFor("researchers", items, (r) => `${r.name}\n${r.description}\n${r.keywords.join(", ")}`),
          chat: (prompt) => model.chat(prompt),
          line: (r, score) => `id=${r.id} | ${r.name} | ${r.description}${score === undefined ? "" : ` | 유사도 ${score.toFixed(3)}`}`,
          keywordTopK: (items, topK) => routeResearchersByKeyword(query, items, topK).selected
        },
        options.part ? { part: { topK: config.split.partTopK } } : {}
      );
    },

    async selectProcedures(query: string, _researcher: Researcher, linked: Procedure[]): Promise<Selection<Procedure>> {
      const config = await readConfig();
      const candidates = linked.filter((procedure) => procedure.enabled);
      return runPipeline(config.procedure, candidates, {
        query,
        embedQuery: queryEmbedder(query),
        vectorsOf: (items) => embeddingsFor("procedures", items, (p) => `${p.name}\n${p.appliesWhen.join(", ")}\n${p.impacts.join(" ")}\n${p.steps.join(" ")}`),
        chat: (prompt) => model.chat(prompt),
        line: (p, score) => `id=${p.id} | ${p.name} | 적용: ${p.appliesWhen.join(", ")} | 임팩트: ${p.impacts.join(" / ")}${score === undefined ? "" : ` | 유사도 ${score.toFixed(3)}`}`,
        keywordTopK: (items, topK) => routeProceduresByKeyword(query, items, topK).selected
      });
    }
  };
}
