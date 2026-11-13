import { createHash } from "node:crypto";
import type pg from "pg";
import type { Procedure, Researcher, RouterConfig, RoutingMethod } from "dualcontext_domain/common";
import {
  parseIdSelection,
  routeProceduresByKeyword,
  routeResearchersByKeyword,
  topKByEmbedding,
  type Selection
} from "dualcontext_domain/server";
import type { ModelClient } from "../model/index.js";

export async function readRouterConfig(pool: pg.Pool): Promise<RouterConfig> {
  const { rows } = await pool.query<RouterConfig>(
    `select researcher_method as "researcherMethod", researcher_top_k as "researcherTopK", researcher_prompt as "researcherPrompt",
            procedure_method as "procedureMethod", procedure_top_k as "procedureTopK", procedure_prompt as "procedurePrompt"
       from router_config where id = 1`
  );
  return rows[0];
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

type Target<T> = {
  table: "researchers" | "procedures";
  method: RoutingMethod;
  topK: number;
  prompt: string;
  query: string;
  candidates: T[];
  /** 임베딩할 글(캐시 키의 일부). */
  embeddingText: (item: T) => string;
  /** LLM 후보 목록에 한 줄로 보일 글. */
  line: (item: T) => string;
  byKeyword: () => Selection<T>;
};

/** 조사원 라우팅(1단계)과 프로시저 라우팅(2단계)을 라우터 설정대로 수행한다. */
export function createSelectors(pool: pg.Pool, model: ModelClient) {
  /** 항목별 임베딩을 DB 에 캐시한다. 글이나 모델이 바뀌면 키가 달라져 다시 계산한다. */
  async function embeddingsFor<T extends { id: number }>(table: Target<T>["table"], items: T[], textOf: (item: T) => string) {
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

  async function pick<T extends { id: number }>(target: Target<T>): Promise<Selection<T>> {
    if (target.candidates.length === 0) return { mode: "none", selected: [] };
    if (target.method === "keyword") return target.byKeyword();
    try {
      if (target.method === "embedding") {
        const [queryVector] = await model.embed([target.query]);
        const vectors = await embeddingsFor(target.table, target.candidates, target.embeddingText);
        const items = target.candidates.map((item, index) => ({ item, vector: vectors[index] }));
        return { mode: "embedding", selected: topKByEmbedding(queryVector, items, target.topK) };
      }
      const answer = await model.chat(
        fill(target.prompt, {
          query: target.query,
          topK: String(target.topK),
          candidates: target.candidates.map(target.line).join("\n")
        })
      );
      const ids = parseIdSelection(answer.replace(/<think>[\s\S]*?<\/think>/g, ""), target.candidates.map((item) => item.id), target.topK);
      if (ids.length === 0) {
        if (/\[\s*\]/.test(answer)) return { mode: "llm", selected: [] };
        throw new Error("LLM answer had no valid id");
      }
      return { mode: "llm", selected: ids.map((id) => target.candidates.find((item) => item.id === id) as T) };
    } catch (error) {
      // 되돌림은 조용히 하지 않는다: 어떤 방법이 왜 실패해 키워드로 갔는지 모드에 남긴다.
      const reason = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 80);
      const fallback = target.byKeyword();
      return { mode: `${target.method}-failed(${reason})->${fallback.mode}`, selected: fallback.selected };
    }
  }

  return {
    async selectResearchers(query: string, researchers: Researcher[]): Promise<Selection<Researcher>> {
      const config = await readRouterConfig(pool);
      const candidates = researchers.filter((researcher) => researcher.enabled);
      return pick({
        table: "researchers",
        method: config.researcherMethod,
        topK: config.researcherTopK,
        prompt: config.researcherPrompt,
        query,
        candidates,
        embeddingText: (r) => `${r.name}\n${r.description}\n${r.keywords.join(", ")}`,
        line: (r) => `id=${r.id} | ${r.name} | ${r.description}`,
        byKeyword: () => routeResearchersByKeyword(query, candidates, config.researcherTopK)
      });
    },

    async selectProcedures(query: string, _researcher: Researcher, linked: Procedure[]): Promise<Selection<Procedure>> {
      const config = await readRouterConfig(pool);
      const candidates = linked.filter((procedure) => procedure.enabled);
      return pick({
        table: "procedures",
        method: config.procedureMethod,
        topK: config.procedureTopK,
        prompt: config.procedurePrompt,
        query,
        candidates,
        embeddingText: (p) => `${p.name}\n${p.appliesWhen.join(", ")}\n${p.impacts.join(" ")}\n${p.steps.join(" ")}`,
        line: (p) => `id=${p.id} | ${p.name} | 적용: ${p.appliesWhen.join(", ")} | 임팩트: ${p.impacts.join(" / ")}`,
        byKeyword: () => routeProceduresByKeyword(query, candidates, config.procedureTopK)
      });
    }
  };
}
