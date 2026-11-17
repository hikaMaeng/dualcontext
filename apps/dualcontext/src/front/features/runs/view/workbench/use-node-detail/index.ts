import { useEffect, useState } from "react";
import type { RunNodeDetail } from "dualcontext_domain/common";
import { loadNode } from "../../../api";

/** idle 읽지 않음(키 없음), loading 읽는 중, ready 문서 있음, missing 문서 없음(404 · 문서를 남기지 않는 노드), failed 읽기 실패. */
export type NodeDocStatus = "idle" | "loading" | "ready" | "missing" | "failed";
export type NodeDoc = { status: NodeDocStatus; doc: RunNodeDetail | null };

/** 진행 중인 실행에서 아직 없거나 자라는 중인 노드 문서를 다시 읽는 간격(ms). */
export const refreshMs = 4000;

/** 서버에 문서가 없는 노드 키: 질의는 실행 행 자체가 상세다. */
export const hasNoDocument = (key: string): boolean => key === "query";

/**
 * 노드 하나의 상세 문서를 읽는다(노드를 고를 때). 키가 바뀌면 다시 읽고 늦게 온 옛 응답은 버린다.
 * 실행이 진행 중이면 refreshMs 마다 다시 읽는다(아이템 노드는 사전 요구 분석 → 컨텍스트 생성 순으로 문서가 자란다).
 * 끝난 실행이 문서를 갖고 있지 않으면 한 번만 읽는다. enabled=false 면 읽지 않는다(펼쳐야 보이는 보조 문서용).
 * stored 가 false → true 로 바뀌면(실행 상세의 nodes 에 키가 생김) 바로 다시 읽는다.
 */
export function useNodeDetail(runId: number, key: string | null, options: { running: boolean; stored: boolean; enabled?: boolean }): NodeDoc {
  const [state, setState] = useState<NodeDoc & { for: string }>({ status: "idle", doc: null, for: "" });
  const [tick, setTick] = useState(0);
  const enabled = options.enabled !== false && key !== null && !hasNoDocument(key);
  const identity = `${runId}|${key}`;

  useEffect(() => {
    if (!enabled || key === null) return;
    let stale = false;
    loadNode(runId, key)
      .then((doc) => {
        if (!stale) setState({ status: doc ? "ready" : "missing", doc, for: identity });
      })
      .catch(() => {
        if (!stale) setState((current) => ({ status: "failed", doc: current.for === identity ? current.doc : null, for: identity }));
      });
    return () => {
      stale = true;
    };
  }, [enabled, runId, key, identity, options.stored, tick]);

  useEffect(() => {
    if (!enabled || !options.running) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), refreshMs);
    return () => window.clearInterval(timer);
  }, [enabled, options.running, identity]);

  if (!enabled) return { status: "idle", doc: null };
  // 다른 노드의 이전 결과를 새 노드로 보이지 않는다.
  if (state.for !== identity) return { status: "loading", doc: null };
  return { status: state.status, doc: state.doc };
}
