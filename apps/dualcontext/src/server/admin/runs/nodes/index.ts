import type pg from "pg";
import type { RunNodeDetail } from "dualcontext_domain/common";
import type { NodeSink } from "../../../plan/calls/index.js";

/** 노드 키 모양: 규칙(runNodeKey)의 문자(영숫자 · : · - · _ · .)만. 그 밖의 값은 읽을 일이 없으므로 거부한다. */
export const validNodeKey = (key: string): boolean => /^[A-Za-z0-9:_.-]{1,64}$/.test(key);

/** 저장된 노드 상세 하나. 없으면 null. */
export async function readNode(pool: pg.Pool, runId: number, key: string): Promise<RunNodeDetail | null> {
  const { rows } = await pool.query<{ detail: RunNodeDetail }>("select detail from augment_run_nodes where run_id = $1 and key = $2", [runId, key]);
  return rows[0]?.detail ?? null;
}

type Patch = Parameters<NodeSink>[1];

/**
 * 노드 문서 저장기. 같은 키의 조각은 대기 중에 필드별로 합치고(뒤 값이 이긴다), 저장은 한 번에 하나씩 직렬로 한다
 * (느린 DB 가 쓰기를 쌓지 않는다). 저장은 jsonb `||` 로 이미 있는 문서와 합친다(사전 요구 분석 조각과 컨텍스트 생성 조각이 한 문서로).
 * 키: 노드 키. 범위 · 수명: 실행 하나(execute 한 번). 상한: 대기는 키 수만큼(아이템 · 라운드에 비례). 비우는 쪽: pump 가 쓰고 나면 지운다.
 * 쓰기 실패는 건너뛴다(실행을 멈추지 않는다). 직렬화는 push 안에서 바로 한다(호출자가 같은 객체를 계속 고칠 수 있다).
 * settle 은 대기 · 진행 중인 쓰기가 모두 끝날 때까지 기다린다. onSaved 는 한 번 쓴 뒤 불린다(실행 상세 방송).
 */
export function createNodeSaver(pool: pg.Pool, runId: number, onSaved: () => Promise<void>, now: () => Date = () => new Date()) {
  const pending = new Map<string, Record<string, unknown>>();
  let pumping: Promise<void> | null = null;
  const pump = async () => {
    while (pending.size > 0) {
      const [key, patch] = pending.entries().next().value as [string, Record<string, unknown>];
      pending.delete(key);
      try {
        await pool.query(
          `insert into augment_run_nodes (run_id, key, detail) values ($1, $2, $3)
           on conflict (run_id, key) do update set detail = augment_run_nodes.detail || excluded.detail, updated_at = now()`,
          [runId, key, JSON.stringify({ key, ...patch, at: now().toISOString() })]
        );
        await onSaved();
      } catch {
        // 노드 기록 실패는 건너뛴다. 같은 키가 다시 오면 그때 쓴다.
      }
    }
  };
  const start = () => {
    pumping = pump().finally(() => {
      pumping = null;
      if (pending.size > 0) start();
    });
  };
  const sink: NodeSink = (key, patch: Patch) => {
    pending.set(key, { ...(pending.get(key) ?? {}), ...JSON.parse(JSON.stringify(patch)) });
    if (pumping === null) start();
  };
  return {
    push: sink,
    async settle() {
      while (pumping !== null) await pumping;
    }
  };
}
