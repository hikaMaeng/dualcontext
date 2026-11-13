import type { AugmentResult, Material, Pair, Procedure, Researcher, WriterMode } from "../../common/index.js";
import type { Selection } from "../route/index.js";
import { mergeContexts, writeContext } from "../write/index.js";

/** 바깥 세계와의 경계. 저장소, 출처, 모델 호출은 앱이 채운다. */
export type AugmentPorts = {
  listResearchers: () => Promise<Researcher[]>;
  /** 조사원에 연결된 프로시저(연결 순서). */
  listProceduresOf: (researcher: Researcher) => Promise<Procedure[]>;
  /** 1단계 라우팅: 질의로 조사원을 고른다. */
  selectResearchers: (query: string, candidates: Researcher[]) => Promise<Selection<Researcher>>;
  /** 2단계 라우팅: (질의, 조사원)으로 연결된 프로시저를 고른다. */
  selectProcedures: (query: string, researcher: Researcher, candidates: Procedure[]) => Promise<Selection<Procedure>>;
  collect: (researcher: Researcher, query: string) => Promise<Material[]>;
  writer: { mode: WriterMode; write: (query: string, pairs: Pair[]) => Promise<string> | string };
};

/**
 * 질의를 증강한다: 조사원 라우팅 → 조사원별 수집 → (질의, 조사원)별 프로시저 라우팅 → 라이터.
 * 한 조사원에 프로시저가 여럿 선택되면 같은 자료에 쌍이 여럿 생긴다.
 * 라이터가 batch 면 모든 쌍을 한 번에, per_pair 면 쌍마다 한 번씩 호출하고 이어 붙인다.
 */
export async function augmentQuery(query: string, ports: AugmentPorts): Promise<AugmentResult> {
  const researcherSelection = await ports.selectResearchers(query, await ports.listResearchers());
  const pairs: Pair[] = [];
  const procedureRoutings: string[] = [];

  for (const researcher of researcherSelection.selected) {
    const materials = await ports.collect(researcher, query).then(
      (found) => ({ found, error: undefined }),
      (error: unknown) => ({ found: [] as Material[], error: error instanceof Error ? error.message : String(error) })
    );
    const procedureSelection = await ports.selectProcedures(query, researcher, await ports.listProceduresOf(researcher));
    const procedures = procedureSelection.selected;
    const base = { researcher, materials: materials.found, error: materials.error };
    if (procedures.length === 0) {
      pairs.push({ ...base, procedure: null });
      procedureRoutings.push(procedureSelection.mode);
    }
    for (const procedure of procedures) {
      pairs.push({ ...base, procedure });
      procedureRoutings.push(procedureSelection.mode);
    }
  }

  let context: string;
  let calls: number;
  if (pairs.length === 0) {
    context = writeContext(query, []);
    calls = 0;
  } else if (ports.writer.mode === "per_pair") {
    const parts: string[] = [];
    for (const pair of pairs) parts.push(await ports.writer.write(query, [pair]));
    context = mergeContexts(query, parts);
    calls = pairs.length;
  } else {
    context = await ports.writer.write(query, pairs);
    calls = 1;
  }

  return {
    context,
    researcherRouting: researcherSelection.mode,
    pairs: pairs.map((pair, index) => ({
      researcher: pair.researcher.name,
      procedure: pair.procedure?.name ?? null,
      materialCount: pair.materials.length,
      procedureRouting: procedureRoutings[index]
    })),
    writer: { mode: ports.writer.mode, calls }
  };
}
