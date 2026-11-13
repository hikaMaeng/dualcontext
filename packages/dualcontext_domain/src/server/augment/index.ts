import type { AugmentResult, Material, Pair, Procedure, Researcher } from "../../common/index.js";
import { routeProcedures, routeResearchers } from "../route/index.js";
import { writeContext } from "../write/index.js";

/** 바깥 세계와의 경계. 저장소와 출처 접근은 앱이 채운다. */
export type AugmentPorts = {
  listResearchers: () => Promise<Researcher[]>;
  listProcedures: (researcherId: number) => Promise<Procedure[]>;
  collect: (researcher: Researcher, query: string) => Promise<Material[]>;
  /** 라이터. 생략하면 결정적 기본 라이터를 쓴다. */
  write?: (query: string, pairs: Pair[]) => Promise<string> | string;
};

/**
 * 질의를 증강한다: 연구원 라우팅 → 연구원별 수집 → (질의, 연구원)별 프로시저 라우팅
 * → 라이터가 모든 쌍을 한 번에 받아 컨텍스트 생성.
 * 한 연구원에 프로시저가 여럿이면 쌍도 여럿이 된다(같은 원재료, 다른 기준).
 */
export async function augmentQuery(query: string, ports: AugmentPorts): Promise<AugmentResult> {
  const routing = routeResearchers(query, await ports.listResearchers());
  const pairs: Pair[] = [];

  for (const researcher of routing.selected) {
    const materials = await ports.collect(researcher, query);
    const procedures = routeProcedures(query, await ports.listProcedures(researcher.id));
    if (procedures.length === 0) pairs.push({ researcher, procedure: null, materials });
    for (const procedure of procedures) pairs.push({ researcher, procedure, materials });
  }

  const context = await (ports.write ?? writeContext)(query, pairs);
  return {
    context,
    researcherRouting: routing.mode,
    pairs: pairs.map((pair) => ({
      researcher: pair.researcher.name,
      procedure: pair.procedure?.name ?? null,
      materialCount: pair.materials.length
    }))
  };
}
