import type { AugmentResult, Material, Pair, Procedure, Researcher, RoutingTrace, WriterMode } from "../../common/index.js";
import type { Selection } from "../route/index.js";
import { mergeContexts, webLast } from "../write/index.js";
import { selectForQuery, trace, type SelectPorts } from "./select.js";

/** 바깥 세계와의 경계. 저장소, 출처, 모델 호출은 앱이 채운다. */
export type AugmentPorts = SelectPorts & {
  listResearchers: () => Promise<Researcher[]>;
  /** 조사원에 연결된 프로시저(연결 순서). */
  listProceduresOf: (researcher: Researcher) => Promise<Procedure[]>;
  /** 2단계 라우팅: (질의, 조사원)으로 연결된 프로시저를 고른다. */
  selectProcedures: (query: string, researcher: Researcher, candidates: Procedure[]) => Promise<Selection<Procedure>>;
  collect: (researcher: Researcher, query: string) => Promise<Material[]>;
  writer: { mode: WriterMode; write: (query: string, pairs: Pair[]) => Promise<string> | string };
};

/** 조사원 한 곳에서 모으는 자료의 상한(여러 질의로 모은 것을 합쳐도 컨텍스트가 길어지지 않게 한다). */
const maxMaterials = 6;

/** 기본 프로시저가 폴백으로 붙은 쌍의 procedureRouting 값. 라우터 모드(keyword · embedding · llm)와 구분된다. */
export const defaultProcedureRouting = "default";

/**
 * 질의를 증강한다: 조사원 라우팅 → 조사원별 수집 → (질의, 조사원)별 프로시저 라우팅 → 라이터.
 * 한 조사원에 프로시저가 여럿 선택되면 같은 자료에 쌍이 여럿 생긴다.
 * 복합 질의는 하위 질문으로 나눠 라우팅하고(합집합), 하위 질문이 고른 조사원은 그 하위 질문으로 수집한다.
 * 프로시저 라우팅이 하나도 고르지 못하면 조사원의 활성 기본 프로시저(`defaultProcedureId`, 연결된 것만)가 대신 붙고 쌍의 procedureRouting 은 `default` 다.
 * **마땅한 조사원이 없으면(선택 0개) 컨텍스트를 만들지 않는다**: context 는 빈 문자열이고 라이터는 부르지 않는다.
 * 조사원은 골랐지만 어느 출처에서도 자료가 나오지 않았을 때(오류 없이)도 마찬가지다. 수집 오류는 숨기지 않고 컨텍스트에 남긴다.
 * 라이터가 batch 면 모든 쌍을 한 번에, per_pair 면 쌍마다 한 번씩 호출하고 이어 붙인다.
 */
export async function augmentQuery(query: string, ports: AugmentPorts): Promise<AugmentResult> {
  const allResearchers = await ports.listResearchers();
  // 복합 질의는 하위 질문으로도 라우팅한다: 통째로는 한 분야에 밀려 다른 분야의 조사원이 빠진다. 선택은 합집합이다.
  const { parts, asked: selections, merged: researcherSelection } = await selectForQuery(query, allResearchers, ports);
  const routing: RoutingTrace = {
    parts: parts.length > 0 ? parts : undefined,
    researcherSteps: selections.map((entry) => ({ asked: entry.asked, steps: entry.selection.steps ?? [] })),
    individual: selections.some((entry) => entry.selection.individual?.length) ? selections.map((entry) => ({ asked: entry.asked, results: entry.selection.individual ?? [] })) : undefined,
    researchers: trace(allResearchers, researcherSelection.scores),
    procedures: []
  };
  const pairs: Pair[] = [];
  const procedureRoutings: string[] = [];

  for (const researcher of researcherSelection.selected) {
    // 이 조사원을 고른 질의(통째 또는 하위 질문)마다 수집하고 자료는 제목으로 중복을 없앤다.
    const asks = selections.filter((entry) => entry.selection.selected.some((chosen) => chosen.id === researcher.id)).map((entry) => entry.asked);
    const collected: Material[] = [];
    const errors: string[] = [];
    for (const asked of asks.includes(query) ? [query] : asks) {
      try {
        for (const material of await ports.collect(researcher, asked)) if (!collected.some((existing) => existing.title === material.title)) collected.push(material);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    const materials = { found: collected.slice(0, maxMaterials), error: collected.length === 0 && errors.length > 0 ? errors.join("; ") : undefined };
    // 자료가 하나도 없으면 분석 관점을 붙일 대상이 없다. 프로시저를 고르지 않는다(관련 없는 절차가 컨텍스트에 실리는 것을 막는다).
    if (materials.found.length === 0 && materials.error === undefined) {
      pairs.push({ researcher, materials: [], procedure: null });
      procedureRoutings.push("skipped(no-material)");
      continue;
    }
    const linked = await ports.listProceduresOf(researcher);
    const procedureSelection = await ports.selectProcedures(query, researcher, linked);
    const procedures = procedureSelection.selected;
    const base = { researcher, materials: materials.found, error: materials.error };
    // 폴백: 라우팅이 하나도 고르지 못했을 때만, 연결 목록에 있는 활성 기본 프로시저를 대신 붙인다(고른 것이 있으면 붙이지 않는다).
    const fallback = procedures.length === 0 ? linked.find((procedure) => procedure.id === researcher.defaultProcedureId && procedure.enabled) : undefined;
    routing.procedures.push({ researcher: researcher.name, candidates: trace(linked, procedureSelection.scores), ...(fallback ? { fallback: "default" as const } : {}) });
    if (fallback) {
      pairs.push({ ...base, procedure: fallback });
      procedureRoutings.push(defaultProcedureRouting);
    } else if (procedures.length === 0) {
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
  // 웹 검색 쌍은 큐레이션 쌍 뒤에 둔다(라이터가 별도 섹션으로 다룬다). 반환하는 pairs 의 순서는 그대로다.
  const ordered = webLast(pairs);
  let context: string;
  let calls: number;
  if (!useful) {
    context = "";
    calls = 0;
  } else if (ports.writer.mode === "per_pair") {
    const parts: string[] = [];
    for (const pair of ordered) parts.push(await ports.writer.write(query, [pair]));
    context = mergeContexts(query, parts);
    calls = pairs.length;
  } else {
    context = await ports.writer.write(query, ordered);
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
