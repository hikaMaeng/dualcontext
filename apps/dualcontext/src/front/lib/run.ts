import { useEffect, useState } from "react";
import type { Answers, AugmentPair, RoutingTrace } from "dualcontext_domain/common";
import { api } from "./api";

export type RunStatus = "running" | "ok" | "error";

/** 실행 로그 한 건의 상세. 진행 중이면 아직 채워지지 않은 필드가 비어 있다. */
export type RunDetail = {
  id: number;
  createdAt: string;
  query: string;
  status: RunStatus;
  stage: "augment" | "answering" | "done" | null;
  error: string | null;
  durationMs: number;
  researcherRouting: string | null;
  /** 라우팅이 후보마다 매긴 점수(임베딩 방식). 증강 단계가 끝나야 채워진다. */
  routing: RoutingTrace | null;
  settings: unknown;
  pairs: AugmentPair[];
  context: string | null;
  /** 답변은 끝나는 대로 하나씩 채워진다. */
  answers: Partial<Answers> | null;
};

const pollMs = 3000;

/**
 * 시험 실행 하나를 따라간다. 서버가 보내는 SSE(/runs/:id/events)로 상태 변화를 즉시 받고,
 * 연결이 끊기거나 브라우저가 지원하지 않으면 같은 정보를 폴링(/runs/:id)으로 받는다.
 * 실행이 끝나면(ok · error) 더 받지 않는다.
 */
export function useRun(id: number | null): RunDetail | null {
  const [run, setRun] = useState<RunDetail | null>(null);

  useEffect(() => {
    setRun(null);
    if (id === null) return;
    let closed = false;
    let source: EventSource | null = null;
    let timer: number | undefined;

    const poll = () => {
      api<RunDetail>(`/runs/${id}`)
        .then((detail) => {
          if (closed) return;
          setRun(detail);
          if (detail.status === "running") timer = window.setTimeout(poll, pollMs);
        })
        .catch(() => {
          if (!closed) timer = window.setTimeout(poll, pollMs * 2);
        });
    };

    if (typeof EventSource === "undefined") {
      poll();
    } else {
      source = new EventSource(`/api/admin/runs/${id}/events`);
      source.onmessage = (event) => {
        const detail = JSON.parse(event.data) as RunDetail;
        setRun(detail);
        // 끝난 실행의 스트림은 서버가 닫는데, 그대로 두면 브라우저가 자동 재연결하므로 먼저 닫는다.
        if (detail.status !== "running") source?.close();
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (!closed) poll();
      };
    }

    return () => {
      closed = true;
      source?.close();
      window.clearTimeout(timer);
    };
  }, [id]);

  return run;
}
