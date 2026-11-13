import type { AugmentResult, Material, Pair, Procedure, Researcher, RoutingScore, RoutingTrace, WriterMode } from "../../common/index.js";
import type { ScoredId, Selection } from "../route/index.js";
import { mergeContexts } from "../write/index.js";

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

/** 후보 이름과 라우팅 점수를 합쳐 사람이 읽을 수 있는 점수표로 만든다. */
function trace(candidates: { id: number; name: string }[], scores: ScoredId[] | undefined): RoutingScore[] {
  return (scores ?? []).map((entry) => ({ name: candidates.find((candidate) => candidate.id === entry.id)?.name ?? String(entry.id), score: Number(entry.score.toFixed(4)), selected: entry.selected }));
}

/**
 * 질의를 증강한다: 조사원 라우팅 → 조사원별 수집 → (질의, 조사원)별 프로시저 라우팅 → 라이터.
 * 한 조사원에 프로시저가 여럿 선택되면 같은 자료에 쌍이 여럿 생긴다.
 * **마땅한 조사원이 없으면(선택 0개) 컨텍스트를 만들지 않는다**: context 는 빈 문자열이고 라이터는 부르지 않는다.
 * 조사원은 골랐지만 어느 출처에서도 자료가 나오지 않았을 때(오류 없이)도 마찬가지다. 수집 오류는 숨기지 않고 컨텍스트에 남긴다.
 * 라이터가 batch 면 모든 쌍을 한 번에, per_pair 면 쌍마다 한 번씩 호출하고 이어 붙인다.
 */
export async function augmentQuery(query: string, ports: AugmentPorts): Promise<AugmentResult> {
  const allResearchers = await ports.listResearchers();
  const researcherSelection = await ports.selectResearchers(query, allResearchers);
  const routing: RoutingTrace = { researchers: trace(allResearchers, researcherSelection.scores), procedures: [] };
  const pairs: Pair[] = [];
  const procedureRoutings: string[] = [];

  for (const researcher of researcherSelection.selected) {
    const materials = await ports.collect(researcher, query).then(
      (found) => ({ found, error: undefined }),
      (error: unknown) => ({ found: [] as Material[], error: error instanceof Error ? error.message : String(error) })
    );
    // 자료가 하나도 없으면 분석 관점을 붙일 대상이 없다. 프로시저를 고르지 않는다(관련 없는 절차가 컨텍스트에 실리는 것을 막는다).
    if (materials.found.length === 0 && materials.error === undefined) {
      pairs.push({ researcher, materials: [], procedure: null });
      procedureRoutings.push("skipped(no-material)");
      continue;
    }
    const linked = await ports.listProceduresOf(researcher);
    const procedureSelection = await ports.selectProcedures(query, researcher, linked);
    routing.procedures.push({ researcher: researcher.name, candidates: trace(linked, procedureSelection.scores) });
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

  // 쓸 만한 것이 있는가: 자료가 하나라도 모였거나, 수집 실패가 있어 그 사실을 알려야 하는 경우.
  const useful = pairs.some((pair) => pair.materials.length > 0 || pair.error !== undefined);
  let context: string;
  let calls: number;
  if (!useful) {
    context = "";
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
    routing,
    researcherRouting: researcherSelection.mode,
    pairs: pairs.map((pair, index) => ({
      researcher: pair.researcher.name,
      procedure: pair.procedure?.name ?? null,
      materialCount: pair.materials.length,
      materials: pair.materials,
      error: pair.error,
      procedureRouting: procedureRoutings[index]
    })),
    writer: { mode: ports.writer.mode, calls }
  };
}
