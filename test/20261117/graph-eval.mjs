// 실행 로그 그래프 · 증강 실측. 배포 서버(127.0.0.1:18081)에서 decompose(질의 분해만) 와 reevaluate(답변 평가로 컨텍스트 재증강)를 여러 질의로 돌리고,
// 끝난 실행마다 실제 프런트 코드(buildRunGraph · arrangeEdges · layoutGraph · groupFrames · feedPaths)로 그래프 불변식을 검사하고,
// 서버가 저장한 답변 노드의 프롬프트에 1차 아이템 컨텍스트가 실제로 실렸는지 대조한다.
// 실행:  node --import tsx test/20261117/graph-eval.mjs [out.jsonl]
//   MODE=run(기본, 새로 실행) | existing(서버에 남은 계획 실행 전부를 검사만)   CONC=3   ONLY=id,id   PASS=95(통과 점수)   FROM/TO=existing 일 때 run id 범위
import { writeFileSync, appendFileSync } from "node:fs";
import { buildRunGraph, neighborsOf } from "../../apps/dualcontext/src/front/features/runs/view/workbench/model/index.ts";
import { arrangeEdges, feedPaths, groupFrames, layoutGraph } from "../../apps/dualcontext/src/front/features/runs/view/workbench/layout/index.ts";

const base = "http://127.0.0.1:18081/api/admin";
const out = process.argv[2] ?? "test/20261117/graph-eval.jsonl";
const conc = Number(process.env.CONC ?? 3);
const passScore = Number(process.env.PASS ?? 95);
const timeoutMs = 60 * 60 * 1000;
const plan = { maxLevels: 3, maxItems: 8, reevaluate: { maxRounds: 3, passScore, maxMissing: 0, maxNewItems: 3 } };

const queries = [
  { id: "git-undo", q: "git 에서 실수로 push 한 커밋을 되돌리는 방법을 reset 과 revert 의 차이와 함께 알려줘" },
  { id: "k8s", q: "쿠버네티스 파드가 CrashLoopBackOff 일 때 원인을 찾는 순서와 자주 쓰는 명령을 알려줘" },
  { id: "sql-index", q: "PostgreSQL 에서 느린 쿼리를 EXPLAIN ANALYZE 로 진단하고 인덱스를 설계하는 방법을 설명해줘" },
  { id: "tax", q: "프리랜서가 종합소득세 신고할 때 경비 처리 가능한 항목과 단순경비율·기준경비율 차이를 알려줘" },
  { id: "tls", q: "HTTPS 연결에서 TLS 핸드셰이크가 어떻게 진행되는지, 인증서 검증은 어떤 순서로 하는지 설명해줘" },
  { id: "react", q: "React 에서 useEffect 의존성 배열을 잘못 쓰면 생기는 문제와 올바른 데이터 패칭 패턴을 알려줘" },
  { id: "labor", q: "근로계약서 없이 일했을 때 퇴직금 청구 요건과 미지급 시 진정 절차를 알려줘" },
  { id: "cross2", q: "전세 사기 피해자가 HUG 보증보험 이행 청구를 할 때 필요한 절차와 임차권등기·경매 신청의 선후 관계를 알려줘" }
];
const modes = ["decompose", "reevaluate"];

const get = async (path) => {
  const r = await fetch(`${base}${path}`);
  return r.ok ? r.json() : null;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nodeDoc = (id, key) => get(`/runs/${id}/nodes/${encodeURIComponent(key)}`);

/** 서버 조립 규칙과 같은 문자열(assembleContext): top · built · 비지 않은 컨텍스트만 `## 이름` 섹션. 이 파일의 사본이 아니라 서버 함수를 호출해 비교하려면 서버 코드 import 가 필요해, 규칙을 인용해 대조한다(docs/plan.md#assemble). */
const section = (item) => `## ${item.name}\n\n${item.context.trim()}`;

async function inspect(job, d) {
  const problems = [];
  const notes = [];
  const p = d.plan ?? null;
  const row = { ...job, runId: d.id, status: d.status, durationSec: Math.round((d.durationMs ?? 0) / 1000) };
  if (d.status !== "ok") problems.push(`실행 상태 ${d.status}: ${d.error}`);
  if (!p) { problems.push("plan 없음"); row.problems = problems; return row; }
  row.stop = p.stop; row.items = p.items.length; row.rounds = p.rounds.length;
  row.scores = p.rounds.map((r) => r.evaluation?.score ?? null);
  row.added = p.rounds.map((r) => r.addedItemIds.length);
  row.fromPlan = Boolean(d.answers?.after?.fromPlan);
  if (p.items.length === 0) { row.noItems = true; row.problems = problems; return row; }

  // ── 그래프 불변식(실제 프런트 코드)
  const graph = buildRunGraph({ status: d.status, stage: d.stage, error: d.error, plan: p, answers: d.answers, nodes: d.nodes });
  const itemNodes = graph.nodes.filter((n) => n.kind === "item");
  row.groups = graph.groups.length;
  const roundsWithItems = [...new Set(p.items.map((i) => i.round))].length;
  if (graph.groups.length !== roundsWithItems) problems.push(`분류 그래프 수 ${graph.groups.length} != 아이템이 있는 라운드 수 ${roundsWithItems}`);
  const analyzeTargets = graph.edges.filter((e) => e.kind === "derive" && e.from === "analyze").map((e) => e.to);
  const byRound = (round) => p.items.filter((i) => i.round === round);
  for (const round of [...new Set(p.items.map((i) => i.round))]) {
    const inRound = byRound(round);
    const needed = new Set(inRound.flatMap((i) => i.needs));
    const entries = inRound.filter((i) => !needed.has(i.id)).map((i) => `item:${i.id}`).sort();
    const from = round === 0 ? "analyze" : `evaluate:${round - 1}`;
    const derived = graph.edges.filter((e) => e.kind === "derive" && e.from === from).map((e) => e.to).sort();
    if (JSON.stringify(entries) !== JSON.stringify(derived)) problems.push(`라운드 ${round}: derive ${JSON.stringify(derived)} != 최상위 아이템 ${JSON.stringify(entries)}`);
    if (round > 0 && !graph.nodes.some((n) => n.id === from)) problems.push(`라운드 ${round}: 출발 노드 ${from} 없음`);
  }
  if (analyzeTargets.length === 0) problems.push("analyze 에서 나가는 derive 없음");

  const ids = graph.nodes.map((n) => n.id);
  const arranged = arrangeEdges(graph.edges, graph.groups);
  for (const orientation of ["vertical", "horizontal"]) {
    const layout = layoutGraph(ids, arranged, orientation);
    const col = new Map(layout.nodes.map((n) => [n.id, n.col]));
    const frames = groupFrames(layout, graph.groups);
    if (layout.nodes.length !== ids.length) problems.push(`${orientation}: 배치 노드 수 불일치`);
    // 겹침 없음
    for (let a = 0; a < layout.nodes.length; a += 1) for (let b = a + 1; b < layout.nodes.length; b += 1) {
      const x = layout.nodes[a], y = layout.nodes[b];
      if (x.x < y.x + y.w && y.x < x.x + x.w && x.y < y.y + y.h && y.y < x.y + x.h) problems.push(`${orientation}: 노드 겹침 ${x.id} ${y.id}`);
    }
    for (const group of graph.groups) {
      const members = group.nodeIds;
      const topmost = Math.min(...members.map((id) => col.get(id)));
      const groupItems = members.map((id) => p.items.find((i) => `item:${i.id}` === id));
      // 같은 그룹 안: 의존하는 쪽이 사전보다 위 층
      for (const item of groupItems) for (const need of item.needs) {
        const prerequisite = p.items.find((i) => i.id === need);
        if (prerequisite.round !== item.round) continue;
        if (!(col.get(`item:${item.id}`) < col.get(`item:${need}`))) problems.push(`${orientation}: 그룹 ${group.n} ${item.id} 가 사전 ${need} 보다 위가 아니다`);
      }
      // 최상위 아이템(누구의 사전도 아닌 것)은 그룹 맨 위 층, 그룹 바깥 출발 노드 바로 아래
      const needed = new Set(groupItems.flatMap((i) => i.needs));
      for (const item of groupItems) if (!needed.has(item.id) && col.get(`item:${item.id}`) !== topmost) notes.push(`${orientation}: 그룹 ${group.n} 의 최상위 ${item.id} 가 맨 위 층이 아님(깊이가 다른 최상위)`);
      // 이 그룹이 먹이는 모든 답변은 그룹 전체보다 아래
      for (const edge of graph.edges.filter((e) => e.kind === "feed" && members.includes(e.from))) {
        const bottom = Math.max(...members.map((id) => col.get(id)));
        if (!(col.get(edge.to) > bottom)) problems.push(`${orientation}: 답변 ${edge.to} 가 그룹 ${group.n} 전체 아래가 아니다`);
      }
      if (!frames.some((f) => f.n === group.n)) problems.push(`${orientation}: 그룹 ${group.n} 틀 없음`);
    }
    // 조립 간선: (그룹, 답변) 쌍마다 정확히 한 줄
    const paths = feedPaths(layout, frames, graph.edges, graph.groups, orientation);
    const expected = new Set();
    for (const edge of graph.edges.filter((e) => e.kind === "feed")) { const g = graph.groups.find((x) => x.nodeIds.includes(edge.from)); if (g) expected.add(`${g.n}>${edge.to}`); }
    const got = paths.map((x) => `${x.group}>${x.to}`);
    if (new Set(got).size !== got.length) problems.push(`${orientation}: 조립선 중복`);
    if ([...expected].sort().join() !== [...got].sort().join()) problems.push(`${orientation}: 조립선 ${JSON.stringify(got)} != 기대 ${JSON.stringify([...expected])}`);
    for (const x of paths) {
      const feeders = graph.edges.filter((e) => e.kind === "feed" && e.to === x.to).map((e) => e.from);
      if (!x.members.every((m) => feeders.includes(m))) problems.push(`${orientation}: 조립선 구성원이 feed 와 다름`);
    }
    // 그려지는 선은 층을 앞으로만 간다
    for (const e of layout.edges) if (!(col.get(e.from) < col.get(e.to))) problems.push(`${orientation}: 뒤로 가는 선 ${e.from}>${e.to}`);
    row[`edges_${orientation}`] = layout.edges.length + paths.length;
  }
  // 최종 답변 노드의 이웃(패널의 "조립에 든 1차 아이템")이 서버 assemble 기록과 같다
  const lastAssemble = [...(p.steps ?? [])].reverse().find((s) => s.kind === "assemble");
  const finalNode = graph.nodes.find((n) => n.final);
  if (finalNode && lastAssemble) {
    const shown = neighborsOf(graph, finalNode.id).inputs.filter((n) => n.kind === "item").map((n) => n.id.slice(5)).sort();
    const recorded = [...lastAssemble.items].sort();
    if (graph.nodes.some((n) => n.id === "answer:after") || row.fromPlan) if (shown.join() !== recorded.join()) problems.push(`최종 답변 이웃 ${shown} != 마지막 조립 ${recorded}`);
  }

  // ── 실제 동작: 답변 프롬프트에 1차 아이템 컨텍스트가 실렸는가
  const answerKeys = [...p.rounds.map((r) => `answer:${r.round}`), ...(d.nodes.includes("answer:after") ? ["answer:after"] : [])];
  const assembles = (p.steps ?? []).filter((s) => s.kind === "assemble");
  row.answerChecks = [];
  for (const key of answerKeys) {
    const doc = await nodeDoc(d.id, key);
    const prompt = (doc?.calls?.[0]?.prompt ?? "").replace(/\n?…\(이하 \d+자 생략\)$/, ""); // 노드 문서가 6만 자에서 자르며 붙이는 표지 제거
    if (!doc || !prompt) { notes.push(`${key}: 호출 기록 없음(답변 실패 · 생략)`); continue; }
    const round = key === "answer:after" ? null : Number(key.split(":")[1]);
    // 기대 조립: 그 라운드 조립 단계의 items. 최종(answer:after)은 마지막 조립.
    const step = round === null ? assembles.at(-1) : assembles.find((s) => s.round === round);
    if (!step) { notes.push(`${key}: 조립 단계 기록 없음`); continue; }
    const assembled = step.items.map((id) => p.items.find((i) => i.id === id)).filter(Boolean).filter((i) => i.context.trim());
    const expected = assembled.map(section).join("\n\n");
    const topsBuilt = p.items.filter((i) => i.top && i.status === "built" && i.context.trim() && (round === null || i.round <= round));
    // 프롬프트에 실린 컨텍스트: 노드 문서는 6만 자에서 잘린다(truncated). 안 잘렸으면 조립 문자열 전체가 들어 있어야 하고, 잘렸으면 프롬프트의 컨텍스트 구간이 조립 문자열의 접두여야 한다.
    const truncated = Boolean(doc.calls[0].truncated);
    const at = prompt.indexOf(assembled[0] ? section(assembled[0]).slice(0, 80) : "\u0000");
    let verified;
    if (assembled.length === 0) verified = "empty";
    else if (at < 0) verified = "absent";
    else if (!truncated) verified = prompt.includes(expected) ? "full" : "partial";
    else verified = expected.startsWith(prompt.slice(at)) || prompt.slice(at).startsWith(expected) ? "prefix" : "mismatch";
    const covered = truncated ? Math.min(prompt.length - at, expected.length) : expected.length;
    const stray = p.items.filter((i) => !i.top && i.context.trim().length > 200 && prompt.includes(section(i)));
    // 서버가 기록한 라운드 컨텍스트 길이(최종 답변은 run.context 길이)와 기대 조립 길이 대조
    const recorded = round === null ? (d.context ?? "").length : p.rounds.find((r) => r.round === round)?.contextChars;
    row.answerChecks.push({ key, assembled: assembled.length, topsBuilt: topsBuilt.length, verified, truncated, coveredChars: covered, expectedChars: expected.length, recordedChars: recorded, stray: stray.length });
    if (["absent", "partial", "mismatch"].includes(verified)) problems.push(`${key}: 1차 아이템 조립본이 프롬프트와 다르다(${verified})`);
    if (recorded !== undefined && recorded !== expected.length) problems.push(`${key}: 서버 기록 컨텍스트 ${recorded}자 != 기대 조립 ${expected.length}자`);
    if (stray.length) problems.push(`${key}: 1차가 아닌 아이템 ${stray.map((i) => i.id)} 가 별도 섹션으로 프롬프트에 실렸다`);
    if (round !== null && topsBuilt.length !== assembled.length) notes.push(`${key}: 만들어진 1차 ${topsBuilt.length} 개 중 조립 ${assembled.length} 개`);
    if (truncated && covered < expected.length) notes.push(`${key}: 노드 문서가 6만 자에서 잘려 조립 ${expected.length}자 중 ${covered}자만 프롬프트로 직접 대조(나머지는 서버 기록 길이로 대조)`);
  }
  // 보강 라운드: 보강으로 새로 만든 1차 아이템이 다음 라운드 답변에 실리는가
  for (const r of p.rounds) {
    if (r.addedItemIds.length === 0) continue;
    const next = p.rounds.find((x) => x.round === r.round + 1);
    if (!next) { notes.push(`라운드 ${r.round} 보강 아이템이 있는데 라운드 ${r.round + 1} 가 없다`); continue; }
    const added = p.items.filter((i) => r.addedItemIds.includes(i.id) && i.top && i.status === "built" && i.context.trim());
    const step = assembles.find((x) => x.round === next.round);
    for (const i of added) if (!step || !step.items.includes(i.id)) problems.push(`보강 아이템 ${i.id}(라운드 ${r.round}) 가 라운드 ${next.round} 조립 기록에 없다`);
    row.supplementFed = (row.supplementFed ?? 0) + added.length;
  }
  row.notes = notes;
  row.problems = problems;
  return row;
}

async function runJob(job) {
  const started = Date.now();
  const start = await (await fetch(`${base}/augment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: job.q, mode: job.mode, plan }) })).json();
  if (!start.runId) return { ...job, status: "start-failed", problems: [`시작 실패: ${JSON.stringify(start).slice(0, 200)}`] };
  let detail;
  for (;;) {
    await sleep(15000);
    detail = await get(`/runs/${start.runId}`);
    if (detail && detail.status !== "running") break;
    if (Date.now() - started > timeoutMs) return { ...job, runId: start.runId, status: "timeout", problems: ["60분 안에 끝나지 않음"] };
  }
  return { ...(await inspect(job, detail)), sec: Math.round((Date.now() - started) / 1000) };
}

writeFileSync(out, "");
const rows = [];
const report = (row) => {
  rows.push(row);
  appendFileSync(out, JSON.stringify(row) + "\n");
  console.log(new Date().toISOString().slice(11, 19), row.id ?? "-", row.mode ?? "-", `run ${row.runId}`, row.status, row.stop ?? "", `items ${row.items ?? "-"} rounds ${row.rounds ?? "-"}`, row.problems?.length ? `문제 ${row.problems.length}` : "OK");
};

if ((process.env.MODE ?? "run") === "existing") {
  const from = Number(process.env.FROM ?? 1), to = Number(process.env.TO ?? 1e9);
  const list = await get(`/runs?pageSize=100`);
  for (const item of list.items.filter((i) => i.id >= from && i.id <= to).sort((a, b) => a.id - b.id)) {
    const d = await get(`/runs/${item.id}`);
    if (!d?.plan) continue;
    report(await inspect({ id: `run${item.id}`, mode: d.plan.mode }, d));
  }
} else {
  const only = process.env.ONLY?.split(",");
  const jobs = queries.filter((q) => !only || only.includes(q.id)).flatMap((q) => modes.map((mode) => ({ ...q, mode })));
  let next = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      console.log(new Date().toISOString().slice(11, 19), "시작", job.id, job.mode);
      let row;
      try { row = await runJob(job); } catch (error) { row = { ...job, status: "script-error", problems: [String(error)] }; }
      report(row);
    }
  }));
}
console.log(`\n실행 ${rows.length}: 문제 없음 ${rows.filter((r) => (r.problems ?? []).length === 0).length}`);
for (const r of rows) if (r.problems?.length) console.log(`- ${r.id}/${r.mode} run ${r.runId}:\n    ${r.problems.join("\n    ")}`);
