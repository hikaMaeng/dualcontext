import { isRunAborted, type AugmentResult, type Material, type Pair, type Procedure, type Researcher, type RoutingTrace, type WriterMode } from "../../common/index.js";
import { settleAll } from "../plan/settle/index.js";
import type { Provided } from "../plan/ports.js";
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
  /** provided 는 사전 컨텍스트(계획기가 앞 아이템에서 만든 것). 없으면 undefined 로 부른다(기존 라이터와 호환). */
  writer: { mode: WriterMode; write: (query: string, pairs: Pair[], provided?: Provided[]) => Promise<string> | string };
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
 * provided(사전 컨텍스트)는 **라이터에만** 전달한다: 라우팅 · 수집은 질의만으로 한다. 빈 배열은 없는 것과 같다.
 * 비지 않은 provided 가 있으면 쌍이 쓸모없어도(선택 0개 · 자료 0개) 라이터를 부른다: 사전 컨텍스트만으로도 이 아이템의 컨텍스트가 된다
 * (A 가 B 를 필요로 하고 B 에만 자료가 있을 때 A 가 비지 않게). 이때 batch 는 쌍 전체(빈 배열일 수 있다)로 1회,
 * per_pair 는 쌍이 쓸모없으므로 빈 쌍 배열로 1회 부른다. provided 가 없거나 모두 비면 기존과 같다(라이터를 부르지 않고 "").
 * see docs/plan.md#build
 */
export async function augmentQuery(query: string, ports: AugmentPorts, provided?: Provided[]): Promise<AugmentResult> {
  const given = provided && provided.length > 0 ? provided : undefined;
  // 라이터를 부를 이유가 되는 사전 컨텍스트: 내용이 있는 것만.
  const providedUseful = (given ?? []).some((entry) => typeof entry.context === "string" && entry.context.trim() !== "");
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

  // 조사원마다 수집 · 프로시저 선택은 서로 의존이 없으므로 병렬로 돈다(동시 수는 호출이 지나는 큐의 소비자 수가 정한다).
  // 결과는 조사원 입력 순서로 이어 붙여 pairs · routing 의 순서가 순차 실행과 같다.
  type Outcome = { pairs: Pair[]; routings: string[]; procedureRouting?: RoutingTrace["procedures"][number] };
  const handle = async (researcher: Researcher): Promise<Outcome> => {
    const out: Outcome = { pairs: [], routings: [] };
    // 이 조사원을 고른 질의(통째 또는 하위 질문)마다 수집하고 자료는 제목으로 중복을 없앤다.
    const asks = selections.filter((entry) => entry.selection.selected.some((chosen) => chosen.id === researcher.id)).map((entry) => entry.asked);
    const collected: Material[] = [];
    const errors: string[] = [];
    for (const asked of asks.includes(query) ? [query] : asks) {
      try {
        for (const material of await ports.collect(researcher, asked)) if (!collected.some((existing) => existing.title === material.title)) collected.push(material);
      } catch (error) {
        if (isRunAborted(error)) throw error;
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    const materials = { found: collected.slice(0, maxMaterials), error: collected.length === 0 && errors.length > 0 ? errors.join("; ") : undefined };
    // 자료가 하나도 없으면 분석 관점을 붙일 대상이 없다. 프로시저를 고르지 않는다(관련 없는 절차가 컨텍스트에 실리는 것을 막는다).
    if (materials.found.length === 0 && materials.error === undefined) {
      out.pairs.push({ researcher, materials: [], procedure: null });
      out.routings.push("skipped(no-material)");
      return out;
    }
    const linked = await ports.listProceduresOf(researcher);
    // 기본 프로시저는 라우팅 후보가 아니다: 범용 문구가 구체적 프로시저보다 앞서(1위 적중 24→19로 측정됨) 오히려 흐리기 때문이다. 폴백으로만 붙는다.
    const candidates = linked.filter((procedure) => procedure.id !== researcher.defaultProcedureId);
    const procedureSelection = await ports.selectProcedures(query, researcher, candidates);
    const procedures = procedureSelection.selected;
    const base = { researcher, materials: materials.found, error: materials.error };
    // 폴백: 라우팅이 하나도 고르지 못했을 때만, 연결 목록에 있는 활성 기본 프로시저를 대신 붙인다(고른 것이 있으면 붙이지 않는다).
    const fallback = procedures.length === 0 ? linked.find((procedure) => procedure.id === researcher.defaultProcedureId && procedure.enabled) : undefined;
    out.procedureRouting = { researcher: researcher.name, candidates: trace(candidates, procedureSelection.scores), ...(fallback ? { fallback: "default" as const } : {}) };
    if (fallback) {
      out.pairs.push({ ...base, procedure: fallback });
      out.routings.push(defaultProcedureRouting);
    } else if (procedures.length === 0) {
      out.pairs.push({ ...base, procedure: null });
      out.routings.push(procedureSelection.mode);
    }
    for (const procedure of procedures) {
      out.pairs.push({ ...base, procedure });
      out.routings.push(procedureSelection.mode);
    }
    return out;
  };
  for (const outcome of await settleAll(researcherSelection.selected.map(handle))) {
    pairs.push(...outcome.pairs);
    procedureRoutings.push(...outcome.routings);
    if (outcome.procedureRouting) routing.procedures.push(outcome.procedureRouting);
  }

  // 쓸 만한 것이 있는가: 자료가 하나라도 모였거나, 수집 실패가 있어 그 사실을 알려야 하는 경우.
  const pairsUseful = pairs.some((pair) => pair.materials.length > 0 || pair.error !== undefined);
  const useful = pairsUseful || providedUseful;
  // 웹 검색 쌍은 큐레이션 쌍 뒤에 둔다(라이터가 별도 섹션으로 다룬다). 반환하는 pairs 의 순서는 그대로다.
  const ordered = webLast(pairs);
  let context: string;
  let calls: number;
  if (!useful) {
    context = "";
    calls = 0;
  } else if (ports.writer.mode === "per_pair" && !pairsUseful) {
    // 쌍은 쓸모없고 사전 컨텍스트만 있다: 쌍마다 부를 대상이 없으므로 빈 쌍 배열로 한 번 부른다.
    context = mergeContexts(query, [await ports.writer.write(query, [], given)]);
    calls = 1;
  } else if (ports.writer.mode === "per_pair") {
    // 쌍별 호출도 각 호출이 사전 컨텍스트를 받는다(쌍 하나만 보는 LLM 라이터도 앞 아이템을 반영해야 한다).
    // 쌍마다 호출은 서로 의존이 없으므로 병렬로 돌고 결과는 쌍 순서로 이어 붙인다.
    const parts = await settleAll(ordered.map(async (pair) => (given ? ports.writer.write(query, [pair], given) : ports.writer.write(query, [pair]))));
    context = mergeContexts(query, parts);
    calls = pairs.length;
  } else {
    context = await (given ? ports.writer.write(query, ordered, given) : ports.writer.write(query, ordered));
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
