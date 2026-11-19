import type pg from "pg";
import { augmentQuery, type AugmentPorts, type Provided } from "dualcontext_domain/server";
import { listProceduresOf } from "../../admin/procedures/index.js";
import { listResearchers } from "../../admin/researchers/index.js";
import { collect } from "../../collect/index.js";
import type { CollectQueues } from "../../collect/queues/index.js";
import type { ModelClient } from "../../model/index.js";
import { createSelectors } from "../../routing/index.js";
import { createWriter, loadWriter } from "../../writer/index.js";

/** 서버가 가진 의존성 묶음. MCP 도구와 관리자 API 가 같은 것을 쓴다. */
export type Deps = {
  pool: pg.Pool;
  model: ModelClient;
  dataDir: string;
  /** 실행 취소 신호(실행마다 `startRun` 이 채운다). 수집기가 `fetch` · 파일 루프 · 대기에 쓴다. 모델 호출은 `model.forRun` 이 같은 신호로 취소한다. */
  signal?: AbortSignal;
  /** 조사원 수집의 종류별 작업 큐(서버가 하나 만든다). 있으면 모든 수집이 이 큐를 거친다. 시험에서만 비운다. */
  collectors?: CollectQueues;
  /** 큐의 공정성 단위(실행 번호). `startRun` 이 채운다. */
  runKey?: string;
};

/**
 * 한 번의 기본 증강(조사원 라우팅 → 수집 → 프로시저 → 라이터). classic 모드가 이것 하나이고,
 * 계획 모드는 아이템마다 이것을 부른다(질의 = 아이템, provided = 사전 아이템 컨텍스트).
 * 계획기 어댑터(plan/ports)가 이 폴더를 가져가므로 진입점(augment/index)과 나눠 순환 import 를 피한다.
 */
export async function augment(deps: Deps, query: string, writerId?: number, provided?: Provided[]) {
  const selectors = createSelectors(deps.pool, deps.model);
  const ports: AugmentPorts = {
    listResearchers: () => listResearchers(deps.pool),
    listProceduresOf: (researcher) => listProceduresOf(deps.pool, researcher.id),
    split: selectors.split,
    selectResearchers: selectors.selectResearchers,
    selectProcedures: selectors.selectProcedures,
    collect: (researcher, text) =>
      collect(deps.pool, deps.model, deps.dataDir, researcher, text, {
        ...(deps.signal ? { signal: deps.signal } : {}),
        ...(deps.collectors ? { queues: deps.collectors } : {}),
        ...(deps.runKey !== undefined ? { runKey: deps.runKey } : {})
      }),
    writer: createWriter(deps.model, await loadWriter(deps.pool, writerId))
  };
  return provided && provided.length > 0 ? augmentQuery(query, ports, provided) : augmentQuery(query, ports);
}
