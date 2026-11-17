// 세 모드(classic · decompose · reevaluate) × 다양한 질의 측정. 배포 서버(127.0.0.1:18081)의 POST /augment 로 실행하고,
// 실행이 끝나면 실행 상세와 노드 문서를 읽어 불변식을 검사한다. 질의와 기대(분류 라벨)는 이 파일에서 직접 만든 것이다.
// node test/20261117/mode-matrix-eval.mjs [out.jsonl]    (CONC=3 동시 실행 수, ONLY=query-id,… 로 일부만)
import { writeFileSync, appendFileSync } from "node:fs";

const base = "http://127.0.0.1:18081/api/admin";
const out = process.argv[2] ?? "test/20261117/mode-matrix.jsonl";
const conc = Number(process.env.CONC ?? 3);
const timeoutMs = 45 * 60 * 1000;

// 한도 override: 실행 시간을 묶는다(저장 설정은 바꾸지 않는다). 모든 계획 실행에 같은 값.
const plan = { maxLevels: 3, maxItems: 8, reevaluate: { maxRounds: 2, passScore: 80, maxMissing: 0, maxNewItems: 3 } };

const queries = [
  { id: "legal", cat: "도메인(법률)", q: "임차권등기명령을 신청해서 보증금을 돌려받는 절차를 단계별로 설명하고, 신청 요건과 필요한 서류를 알려줘" },
  { id: "docker", cat: "도메인(개발)", q: "도커 컨테이너가 바로 종료되는 원인과 해결 방법을 진단 순서대로 알려줘" },
  { id: "medical", cat: "도메인(의학)", q: "당뇨 환자가 메트포르민을 먹으면서 신기능이 떨어질 때 용량 조절 기준과 주의할 점은?" },
  { id: "finance", cat: "도메인(금융)", q: "금리 인상기에 채권 가격이 왜 떨어지는지 듀레이션 개념으로 설명하고 포트폴리오 대응 방법을 알려줘" },
  { id: "code", cat: "코드베이스", q: "dualcontext 에서 얕은 클론을 수행하는 cloneShallow 함수가 어디에 있고 어떻게 동작하는지 설명해줘" },
  { id: "cross", cat: "교차 도메인", q: "전세 보증금을 못 돌려받았을 때 관련 판례와 등기 절차, 그리고 세금상 불이익이 있는지 알려줘" },
  { id: "english", cat: "영어 질의", q: "How do I fix a git merge conflict and what is the difference between merge and rebase?" },
  { id: "chitchat", cat: "무관(조사원 없음)", q: "안녕 오늘 기분이 어때" }
];
const modes = ["classic", "decompose", "reevaluate"];

const only = process.env.ONLY?.split(",");
const jobs = queries.filter((q) => !only || only.includes(q.id)).flatMap((q) => modes.map((mode) => ({ ...q, mode })));
writeFileSync(out, "");

const get = async (path) => {
  const r = await fetch(`${base}${path}`);
  return r.ok ? r.json() : null;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runJob(job) {
  const started = Date.now();
  const body = { query: job.q, mode: job.mode, ...(job.mode === "classic" ? {} : { plan }) };
  const start = await (await fetch(`${base}/augment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
  if (!start.runId) return { ...job, runId: null, problems: [`시작 실패: ${JSON.stringify(start).slice(0, 200)}`], status: "start-failed" };
  let detail;
  for (;;) {
    await sleep(15000);
    detail = await get(`/runs/${start.runId}`);
    if (detail && detail.status !== "running") break;
    if (Date.now() - started > timeoutMs) return { ...job, runId: start.runId, status: "timeout", problems: ["45분 안에 끝나지 않음"], sec: Math.round((Date.now() - started) / 1000) };
  }
  return { ...(await inspect(job, detail)), sec: Math.round((Date.now() - started) / 1000) };
}

/** 불변식 검사: 상태 · 답변 · 노드 기록 · 그래프 참조 무결성. 문제는 problems 에 문장으로 남긴다. */
async function inspect(job, d) {
  const problems = [];
  const plan = d.plan ?? null;
  const nodes = d.nodes ?? [];
  const has = (key) => nodes.includes(key);
  const row = { ...job, runId: d.id, status: d.status, error: d.error, durationSec: Math.round((d.durationMs ?? 0) / 1000), nodeCount: nodes.length, contextChars: (d.context ?? "").length };
  if (d.status !== "ok") problems.push(`실행 상태 ${d.status}: ${d.error}`);
  const after = d.answers?.after;
  const before = d.answers?.before;
  row.answerBefore = before?.text?.length ?? 0;
  row.answerAfter = after?.text?.length ?? 0;
  row.answerAfterError = after?.error ?? null;
  row.afterFromPlan = Boolean(after?.fromPlan);
  if (!before?.text) problems.push(`증강 전 답변 없음: ${before?.error ?? "-"}`);
  if (!after?.text && d.context) problems.push(`증강 후 답변 없음(컨텍스트는 있음): ${after?.error ?? "-"}`);

  if (job.mode === "classic") {
    if (plan) problems.push("classic 인데 plan 이 있다");
    for (const key of ["classic", "answer:before"]) if (!has(key)) problems.push(`노드 없음: ${key}`);
    if (d.context && !has("answer:after")) problems.push("노드 없음: answer:after");
    const classic = has("classic") ? await get(`/runs/${d.id}/nodes/classic`) : null;
    row.classicCalls = classic?.calls?.length ?? 0;
    row.pairs = d.pairs.length;
  } else {
    if (!plan) problems.push(`${job.mode} 인데 plan 이 없다`);
    else {
      row.stop = plan.stop;
      row.items = plan.items.length;
      row.levels = plan.levels.length;
      row.rounds = plan.rounds.length;
      row.steps = (plan.steps ?? []).length;
      row.planMs = plan.ms;
      row.itemStatus = Object.fromEntries(["built", "empty", "error"].map((s) => [s, plan.items.filter((i) => i.status === s).length]));
      row.scores = plan.rounds.map((r) => r.evaluation?.score ?? null);
      row.added = plan.rounds.map((r) => r.addedItemIds.length);
      if (plan.stop === null) problems.push("plan.stop 이 null(끝났는데 부분 trace)");
      if (job.mode === "decompose" && !["mode-decompose", "no-items"].includes(plan.stop)) problems.push(`decompose 정지 사유 이상: ${plan.stop}`);
      if (job.mode === "reevaluate" && !["passed", "max-rounds", "no-missing", "no-new-items", "no-items"].includes(plan.stop)) problems.push(`reevaluate 정지 사유: ${plan.stop}`);
      // 간선 무결성 · 순환 없음
      const ids = new Set(plan.items.map((i) => i.id));
      for (const item of plan.items) for (const need of item.needs) if (!ids.has(need)) problems.push(`${item.id} 이 없는 아이템 ${need} 을 필요로 한다`);
      const byId = new Map(plan.items.map((i) => [i.id, i]));
      const visiting = new Set();
      const done = new Set();
      const cyc = (id) => { if (done.has(id)) return false; if (visiting.has(id)) return true; visiting.add(id); const hit = (byId.get(id)?.needs ?? []).some(cyc); visiting.delete(id); done.add(id); return hit; };
      if (plan.items.some((i) => cyc(i.id))) problems.push("의존성 순환");
      if (plan.items.length > 0 && !plan.items.some((i) => i.top)) problems.push("top 아이템 없음");
      // 단계 기록 일관성
      const steps = plan.steps ?? [];
      if (steps.length === 0 && plan.items.length > 0) problems.push("steps 비어 있음");
      steps.forEach((s, i) => { if (s.seq !== i + 1) problems.push(`steps seq 어긋남 @${i}`); });
      for (const s of steps) if (s.kind === "build" && !ids.has(s.item)) problems.push(`build 단계가 없는 아이템 ${s.item}`);
      // 노드 문서
      if (plan.items.length > 0 && !has("analyze")) problems.push("노드 없음: analyze");
      let augmentMissing = 0;
      let provided = 0;
      for (const item of plan.items) {
        if (item.status === "pending") problems.push(`${item.id} 가 pending 으로 끝남`);
        if (!has(`item:${item.id}`)) { problems.push(`노드 없음: item:${item.id}`); continue; }
        const doc = await get(`/runs/${d.id}/nodes/${encodeURIComponent(`item:${item.id}`)}`);
        if (!doc) { problems.push(`노드 읽기 실패: item:${item.id}`); continue; }
        if (item.status !== "error" && !doc.augment) augmentMissing += 1;
        provided += doc.provided?.length ?? 0;
        if (item.needs.length > 0 && item.status !== "error" && (doc.provided?.length ?? 0) === 0 && item.needs.some((n) => byId.get(n)?.status === "built")) problems.push(`${item.id} 는 사전 컨텍스트를 받아야 하는데 provided 가 없다`);
      }
      if (augmentMissing > 0) problems.push(`augment 없는 item 노드 ${augmentMissing}개`);
      row.providedLinks = provided;
      if (job.mode === "reevaluate") {
        plan.rounds.forEach((r) => {
          if (!has(`answer:${r.round}`)) problems.push(`노드 없음: answer:${r.round}`);
          if (r.evaluation && !has(`evaluate:${r.round}`)) problems.push(`노드 없음: evaluate:${r.round}`);
          for (const id of r.addedItemIds) { const it = byId.get(id); if (!it || it.round !== r.round + 1) problems.push(`라운드 ${r.round} 보강 아이템 ${id} 의 round 이상`); }
          if (r.evaluation && r.evaluation.pass !== (r.evaluation.score >= plan.limits.reevaluate.passScore && r.evaluation.missing.length <= plan.limits.reevaluate.maxMissing)) problems.push(`라운드 ${r.round} pass 판정이 설정과 어긋남`);
        });
        if (plan.rounds.length === 0 && plan.items.length > 0) problems.push("reevaluate 인데 라운드 0개");
      }
      if (plan.items.length === 0) row.noItems = true;
    }
  }
  row.problems = problems;
  return row;
}

let next = 0;
const rows = [];
await Promise.all(Array.from({ length: conc }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++];
    const t = new Date().toISOString().slice(11, 19);
    console.log(t, "시작", job.id, job.mode);
    let row;
    try { row = await runJob(job); } catch (error) { row = { ...job, status: "script-error", problems: [String(error)] }; }
    rows.push(row);
    appendFileSync(out, JSON.stringify(row) + "\n");
    console.log(new Date().toISOString().slice(11, 19), "끝", job.id, job.mode, `run ${row.runId}`, row.status, `${row.sec}s`, row.stop ?? "", row.problems.length ? `문제 ${row.problems.length}` : "OK");
  }
}));

console.log(`\n실행 ${rows.length}: ok ${rows.filter((r) => r.status === "ok").length}, 문제 없음 ${rows.filter((r) => r.problems.length === 0).length}`);
for (const r of rows) if (r.problems.length) console.log(`- ${r.id}/${r.mode} run ${r.runId}:\n    ${r.problems.join("\n    ")}`);
