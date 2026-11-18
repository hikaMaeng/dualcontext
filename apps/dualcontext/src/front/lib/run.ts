import { useEffect, useState } from "react";
import type { Answers, AugmentPair, PlanTrace, RoutingTrace, RunSource, McpEffort } from "dualcontext_domain/common";
import { api } from "./api";

export type RunStatus = "running" | "ok" | "error";

/**
 * 계획 진행 단계(실행 상세의 planProgress). 도메인은 같은 모양을 `dualcontext_domain/server` 의 PlanProgress 로만 내보내고
 * 프런트는 common 만 import 하므로 여기서 같은 모양으로 둔다. at 은 서버가 기록한 시각(ISO).
 */
export type PlanProgressStage = "analyze" | "dependencies" | "build" | "answer" | "evaluate" | "reinforce" | "done";
export type RunPlanProgress = { stage: PlanProgressStage; detail?: string; at: string };

/** 실행 로그의 쌍. 계획 모드(decompose · reevaluate)에서는 그 쌍을 쓴 컨텍스트 아이템 이름이 함께 온다. */
export type RunPair = AugmentPair & { item?: string };

/** 실행 로그 한 건의 상세. 진행 중이면 아직 채워지지 않은 필드가 비어 있다. */
export type RunDetail = {
  id: number;
  createdAt: string;
  query: string;
  /** 실행의 출처. 옛 응답에는 없을 수 있다(없으면 시험 실행). */
  source?: RunSource;
  /** MCP 호출이 고른 effort. 시험 실행 · 옛 행은 null(또는 없음). */
  effort?: McpEffort | null;
  status: RunStatus;
  stage: "augment" | "answering" | "done" | null;
  error: string | null;
  durationMs: number;
  researcherRouting: string | null;
  /** 라우팅이 후보마다 매긴 점수(임베딩 방식). 증강 단계가 끝나야 채워진다. */
  routing: RoutingTrace | null;
  settings: unknown;
  pairs: RunPair[];
  context: string | null;
  /** 답변은 끝나는 대로 하나씩 채워진다. */
  answers: Partial<Answers> | null;
  /**
   * 컨텍스트 계획 기록. classic 모드와 이 필드가 생기기 전의 실행은 null(또는 없음)이다.
   * 서버는 계획이 끝난 뒤에만 채운다(진행 중 부분 trace 는 없다 — 진행은 planProgress 로 본다).
   */
  plan?: PlanTrace | null;
  /** 계획 진행 단계. 계획 모드 실행이 진행 중일 때 단계마다 갱신된다. classic · 옛 실행은 null(또는 없음). */
  planProgress?: RunPlanProgress | null;
  /**
   * 이 실행에 저장된 노드 상세의 키(`runNodeKey` 규칙: classic · analyze · item:<id> · answer:<r> · evaluate:<r> · dedupe:<r>:<level|seed> …).
   * 상세 본문은 크므로 여기 없고 `GET /runs/:id/nodes/:key` 로 노드를 고를 때 읽는다. 옛 실행은 없다(또는 빈 배열).
   */
  nodes?: string[];
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
