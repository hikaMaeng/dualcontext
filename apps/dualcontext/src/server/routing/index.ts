import { createHash } from "node:crypto";
import type pg from "pg";
import type { Procedure, Researcher, RouterConfig, StageConfig } from "dualcontext_domain/common";
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

    /**
     * 조사원 선택. 개별 라우터가 있는 조사원은 전역 라우터의 후보 목록(카탈로그)에서 빠지고, 각자 자기 파이프라인으로
     * 「이 조사원 하나를 쓸지」만 따로 판정한다(남으면 포함). 두 갈래의 결과는 합쳐져 같은 경로(수집 → 프로시저 매칭)로 이어진다.
     */
    async selectResearchers(query: string, researchers: Researcher[], options: { part?: boolean } = {}): Promise<Selection<Researcher>> {
      const config = await readConfig();
      const enabled = researchers.filter((researcher) => researcher.enabled);
      const individual = enabled.filter((researcher) => researcher.router);
      const global = enabled.filter((researcher) => !researcher.router);
      const env = {
        query,
        embedQuery: queryEmbedder(query),
        vectorsOf: (items: Researcher[]) => embeddingsFor("researchers", items, (r) => `${r.name}\n${r.description}\n${r.keywords.join(", ")}`),
        chat: (prompt: string) => model.chat(prompt),
        line: (r: Researcher, score?: number) => `id=${r.id} | ${r.name} | ${r.description}${score === undefined ? "" : ` | 유사도 ${score.toFixed(3)}`}`,
        keywordTopK: (items: Researcher[], topK: number) => routeResearchersByKeyword(query, items, topK).selected
      };
      const pipelineOptions = options.part ? { part: { topK: config.split.partTopK } } : {};
      const [globalSelection, judged] = await Promise.all([
        runPipeline(config.researcher, global, env, pipelineOptions),
        Promise.all(individual.map((researcher) => runPipeline(researcher.router as StageConfig, [researcher], env, pipelineOptions)))
      ]);
      const scores = [...(globalSelection.scores ?? []), ...judged.flatMap((selection) => selection.scores ?? [])];
      return {
        mode: globalSelection.mode,
        selected: [...globalSelection.selected, ...individual.filter((_researcher, index) => judged[index].selected.length > 0)],
        scores: scores.length > 0 ? scores : undefined,
        steps: globalSelection.steps,
        individual: individual.map((researcher, index) => ({ researcher: researcher.name, selected: judged[index].selected.length > 0, mode: judged[index].mode, steps: judged[index].steps ?? [] }))
      };
    },

    async selectProcedures(query: string, researcher: Researcher, linked: Procedure[]): Promise<Selection<Procedure>> {
      const config = await readConfig();
      // 기본 프로시저는 후보가 아니다(폴백으로만 붙는다). 범용 문구가 구체적 프로시저보다 앞서는 것을 막는다.
      const candidates = linked.filter((procedure) => procedure.enabled && procedure.id !== researcher.defaultProcedureId);
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
