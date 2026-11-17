import type { Answers, PlanItem, PlanStep, PlanTrace } from "dualcontext_domain/common";
import { runNodeKey } from "dualcontext_domain/common";
import type { RunStatus } from "../../../../../lib/run";

/**
 * 실행 로그를 한 장의 그래프로 본다. 이 모듈은 실행 상세(질의 · 계획 trace · 답변)에서 노드 · 간선 · 분류 그래프(그룹)를 만드는 순수 함수다.
 * 글자는 만들지 않는다(문구는 화면이 i18n 으로 붙인다). 노드 id 는 서버 노드 키 규칙(runNodeKey)과 같다: query 만 서버 문서가 없다.
 *
 * 노드
 * - query          사용자 질의
 * - analyze        질의 분해(계획 모드)
 * - item:<id>      컨텍스트 아이템(PlanItem)
 * - classic        classic 모드의 증강 한 번
 * - answer:<r>     재평가 라운드 r 의 답변, evaluate:<r> 그 평가
 * - answer:before  증강 전 답변(질의만), answer:after 증강 후 최종 답변
 *   (reevaluate 에서 마지막 라운드 답변이 그대로 최종 답변이면(answers.after.fromPlan) answer:after 를 따로 두지 않고 그 라운드 답변이 최종이다)
 *
 * 간선(from → to, 시간 · 데이터 흐름 방향)
 * - flow    질의 → 질의 분해, 질의 → 증강 전 답변, classic → 최종 답변, 답변 → 평가
 * - needs   사전 아이템 → 그것을 필요로 하는 아이템
 * - derive  질의 분해 → 처음 계획의 시작 아이템, 평가 r → 보강 r+1 의 시작 아이템(시작 아이템 = 같은 라운드 아이템을 사전으로 필요로 하지 않는 것)
 * - feed    조립에 든 1차 아이템 → 답변
 *
 * 분류 그래프(group) = 아이템을 낳은 원점별 묶음: 1 = 질의 분해(라운드 0 아이템), 그 뒤는 평가가 요구해 라운드 k 에 만든 아이템(k = 1, 2 …).
 */
export type NodeKind = "query" | "analyze" | "item" | "classic" | "answer" | "evaluate" | "final-before" | "final-after";
/** done 완료, running 진행 중, pending 아직(실행이 끝났는데 못 한 것 포함), error 실패, empty 비었음(컨텍스트 없음 · 답변 생략). */
export type NodeState = "done" | "running" | "pending" | "error" | "empty";

export type RunGraphNode = {
  id: string;
  kind: NodeKind;
  state: NodeState;
  /** 분류 그래프 번호(1부터). 아이템 노드만 갖고 나머지는 0. */
  group: number;
  item?: PlanItem;
  /** answer · evaluate 의 라운드, item 의 만들어진 라운드. */
  round?: number;
  ms?: number;
  /** 컨텍스트(아이템) · 답변 본문의 길이. */
  chars?: number;
  /** evaluate */
  score?: number;
  pass?: boolean;
  missing?: number;
  /** 최종 답변 노드인가(answer:after 이거나 최종으로 쓰인 라운드 답변). */
  final?: boolean;
  /** 서버에 이 노드의 상세 문서가 저장돼 있는가(detail.nodes 에 키가 있다). */
  hasDoc: boolean;
};

export type EdgeKind = "flow" | "needs" | "derive" | "feed";
export type RunGraphEdge = { from: string; to: string; kind: EdgeKind };

export type GroupReason = { type: "decompose" } | { type: "evaluation"; round: number };
export type RunGraphGroup = {
  n: number;
  reason: GroupReason;
  nodeIds: string[];
  /** 이 그래프를 만드는 데 걸린 시간(ms, 병렬은 시작~끝). 단계 기록이 없으면 null. */
  ms: number | null;
};

export type RunGraph = { nodes: RunGraphNode[]; edges: RunGraphEdge[]; groups: RunGraphGroup[]; finalId: string };

/** 그래프를 만드는 데 읽는 실행 상세의 부분. */
export type GraphInput = {
  status: RunStatus;
  stage: "augment" | "answering" | "done" | null;
  error: string | null;
  plan?: PlanTrace | null;
  answers: Partial<Answers> | null;
  nodes?: string[];
};

type Step<K extends PlanStep["kind"]> = Extract<PlanStep, { kind: K }>;

const itemKey = runNodeKey.item;

/** 그래프의 시작 아이템: 같은 라운드의 다른 아이템을 사전으로 필요로 하지 않는 것(질의 분해 · 평가가 직접 낳은 쪽으로 이어진다). */
function entryItems(items: PlanItem[], round: number): PlanItem[] {
  const inRound = new Set(items.filter((item) => item.round === round).map((item) => item.id));
  return items.filter((item) => item.round === round && !(item.needs ?? []).some((need) => inRound.has(need)));
}

const itemState = (item: PlanItem, running: boolean): NodeState =>
  item.status === "built" ? "done" : item.status === "error" ? "error" : item.status === "empty" ? "empty" : running ? "running" : "pending";

/** 한 라운드의 계획 단계(seed · 사전 요구 · 중복 정리 · build)가 걸린 시간: 가장 먼저 시작한 것부터 가장 늦게 끝난 것까지. 기록이 없으면 null. */
function groupMs(steps: PlanStep[], round: number): number | null {
  const own = steps.filter((step) => step.round === round && (step.kind === "seed" || step.kind === "prerequisites" || step.kind === "dedupe" || step.kind === "build"));
  if (own.length === 0) return null;
  return Math.max(0, Math.max(...own.map((step) => step.at)) - Math.min(...own.map((step) => Math.max(0, step.at - step.ms))));
}

export function buildRunGraph(run: GraphInput): RunGraph {
  const running = run.status === "running";
  const stored = new Set(run.nodes ?? []);
  const plan = run.plan ?? null;
  const steps = plan?.steps ?? [];
  const nodes: RunGraphNode[] = [];
  const edges: RunGraphEdge[] = [];
  const ids = new Set<string>();
  const add = (node: Omit<RunGraphNode, "hasDoc" | "group"> & { group?: number }) => {
    if (ids.has(node.id)) return;
    ids.add(node.id);
    nodes.push({ group: 0, ...node, hasDoc: stored.has(node.id) });
  };
  const link = (from: string, to: string, kind: EdgeKind) => {
    if (from === to || !ids.has(from) || !ids.has(to) || edges.some((edge) => edge.from === from && edge.to === to)) return;
    edges.push({ from, to, kind });
  };

  add({ id: "query", kind: "query", state: "done" });

  const before = run.answers?.before;
  const answering = run.stage === "answering" || run.stage === "done";
  const beforeNode = (): RunGraphNode["state"] => (before ? (before.text === null ? "error" : "done") : running ? "running" : "pending");

  // ── classic: 증강 한 번 → 최종 답변
  if (!plan) {
    add({
      id: runNodeKey.classic,
      kind: "classic",
      state: run.stage === "augment" ? (running ? "running" : "error") : "done"
    });
    link("query", runNodeKey.classic, "flow");
  }

  // ── 계획 모드: 질의 분해 → 분류 그래프들 → 답변 · 평가 라운드
  const items = plan?.items ?? [];
  const rounds = plan?.rounds ?? [];
  const lastRound = rounds.length > 0 ? rounds.length - 1 : -1;
  const fromPlan = plan !== null && Boolean(run.answers?.after?.fromPlan) && lastRound >= 0;
  const groups: RunGraphGroup[] = [];
  if (plan) {
    const analyzeStep = steps.find((step): step is Step<"analyze"> => step.kind === "analyze");
    add({ id: runNodeKey.analyze, kind: "analyze", state: analyzeStep ? (analyzeStep.error ? "error" : "done") : running ? "running" : "pending", ...(analyzeStep ? { ms: analyzeStep.ms } : {}) });
    link("query", runNodeKey.analyze, "flow");

    const roundsWithItems = [...new Set(items.map((item) => item.round))].sort((a, b) => a - b);
    roundsWithItems.forEach((round, index) => {
      const own = items.filter((item) => item.round === round);
      groups.push({ n: index + 1, reason: round === 0 ? { type: "decompose" } : { type: "evaluation", round: round - 1 }, nodeIds: own.map((item) => itemKey(item.id)), ms: groupMs(steps, round) });
      for (const item of own) add({ id: itemKey(item.id), kind: "item", state: itemState(item, running), group: index + 1, item, round: item.round, ...(item.ms !== undefined ? { ms: item.ms } : {}), chars: item.context.length });
    });
    for (const item of items) for (const need of item.needs ?? []) link(itemKey(need), itemKey(item.id), "needs");

    // 답변 · 평가 라운드
    for (const record of rounds) {
      const answerId = runNodeKey.answer(record.round);
      const text = record.answer.text;
      add({
        id: answerId,
        kind: "answer",
        round: record.round,
        state: text !== null ? "done" : record.answer.error ? "error" : running ? "running" : "pending",
        ...(text !== null || record.answer.error ? { ms: record.answer.ms } : {}),
        chars: text?.length ?? 0,
        ...(fromPlan && record.round === lastRound ? { final: true } : {})
      });
      const evaluateStep = steps.find((step): step is Step<"evaluate"> => step.kind === "evaluate" && step.round === record.round);
      if (text !== null) {
        const evaluation = record.evaluation;
        add({
          id: runNodeKey.evaluate(record.round),
          kind: "evaluate",
          round: record.round,
          state: evaluation ? "done" : record.evaluationError ? "error" : running ? "running" : "pending",
          ...(evaluateStep ? { ms: evaluateStep.ms } : {}),
          ...(evaluation ? { score: evaluation.score, pass: evaluation.pass, missing: evaluation.missing.length } : {})
        });
        link(answerId, runNodeKey.evaluate(record.round), "flow");
      }
    }
  }

  // ── 증강 전 · 후 최종 답변
  add({ id: runNodeKey.finalAnswer("before"), kind: "final-before", state: beforeNode(), ...(before ? { ms: before.ms, chars: before.text?.length ?? 0 } : {}) });
  link("query", runNodeKey.finalAnswer("before"), "flow");

  const after = run.answers?.after;
  // reevaluate 는 answers.after 가 올 때까지 기다린다(fromPlan 이면 라운드 답변이 최종이라 따로 만들지 않는다 — 도중에 깜빡이지 않게).
  const wantAfter = !fromPlan && (plan ? (plan.mode === "decompose" ? plan.stop !== null && answering : after !== undefined) : true);
  if (wantAfter) {
    add({
      id: runNodeKey.finalAnswer("after"),
      kind: "final-after",
      final: true,
      state: after ? (after.skipped ? "empty" : after.text === null ? "error" : "done") : running ? "running" : "pending",
      ...(after ? { ms: after.ms, chars: after.text?.length ?? 0 } : {})
    });
  }

  // ── 간선
  if (plan) {
    const starts = (round: number) => entryItems(items, round).map((item) => itemKey(item.id));
    for (const id of starts(0)) link(runNodeKey.analyze, id, "derive");
    for (const record of rounds) {
      const next = record.round + 1;
      if (items.some((item) => item.round === next)) for (const id of starts(next)) link(runNodeKey.evaluate(record.round), id, "derive");
    }
    // 조립에 든 1차 아이템 → 답변. 단계 기록이 없으면 그 라운드까지의 완성된 1차 아이템.
    const assembled = (round: number): string[] => {
      const step = steps.find((entry): entry is Step<"assemble"> => entry.kind === "assemble" && entry.round === round);
      return step ? step.items : items.filter((item) => item.top && item.status === "built" && item.round <= round).map((item) => item.id);
    };
    for (const record of rounds) for (const id of assembled(record.round)) link(itemKey(id), runNodeKey.answer(record.round), "feed");
    if (wantAfter) {
      const last = [...steps].reverse().find((entry): entry is Step<"assemble"> => entry.kind === "assemble");
      const tops = last ? last.items : items.filter((item) => item.top && item.status === "built").map((item) => item.id);
      for (const id of tops) link(itemKey(id), runNodeKey.finalAnswer("after"), "feed");
    }
  } else if (wantAfter) {
    link(runNodeKey.classic, runNodeKey.finalAnswer("after"), "flow");
  }

  const finalId = nodes.find((node) => node.final)?.id ?? (lastRound >= 0 ? runNodeKey.answer(lastRound) : "query");
  return { nodes, edges, groups, finalId };
}

/** 노드의 이웃: 이 노드로 들어오는 간선의 출발 노드(inputs)와 나가는 간선의 도착 노드(outputs). */
export function neighborsOf(graph: Pick<RunGraph, "nodes" | "edges">, id: string): { inputs: RunGraphNode[]; outputs: RunGraphNode[] } {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const pick = (ids: string[]) => ids.flatMap((other) => (byId.has(other) ? [byId.get(other) as RunGraphNode] : []));
  return { inputs: pick(graph.edges.filter((edge) => edge.to === id).map((edge) => edge.from)), outputs: pick(graph.edges.filter((edge) => edge.from === id).map((edge) => edge.to)) };
}

/** 키로 노드를 찾는다. 새 창 화면처럼 그래프에 아직 없는 키(진행 중)는 undefined. */
export function nodeOf(graph: Pick<RunGraph, "nodes">, id: string): RunGraphNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}
