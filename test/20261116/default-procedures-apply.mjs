// 조사원별 「기본 프로시저」 적용 스크립트 (외부 의존성 없음, UTF-8).
//   DRY=1  node default-procedures-apply.mjs   요청을 보내지 않고 계획만 출력(GET 만 일어난다)
//          node default-procedures-apply.mjs   적용(멱등: 같은 이름 프로시저는 재사용)
//   UNDO=1 node default-procedures-apply.mjs   이 스크립트가 만든 프로시저를 연결·기본 지정에서 빼고 삭제
//   BASE=http://127.0.0.1:18081 로 대상 서버를 바꿀 수 있다. UNDO 도 DRY=1 과 함께 쓰면 계획만 출력한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE ?? "http://127.0.0.1:18081").replace(/\/$/, "");
const API = `${BASE}/api/admin`;
const DRY = process.env.DRY === "1";
const UNDO = process.env.UNDO === "1";
const dir = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(dir, "default-procedures.json"), "utf8"));

async function call(method, url, body) {
  const response = await fetch(`${API}${url}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${url} -> ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** 쓰기 요청은 DRY 이면 보내지 않고 계획만 출력한다. */
async function write(method, url, body, label) {
  if (DRY) {
    console.log(`  [계획] ${method} ${url}  ${label}`);
    return null;
  }
  return call(method, url, body);
}

/** PUT 본문: GET 값에서 id 만 빼고 그대로 둔다(다른 필드 보존). */
function researcherBody(researcher, procedureIds, defaultProcedureId) {
  const { id: _id, ...rest } = researcher;
  return { ...rest, procedureIds, defaultProcedureId };
}

// 검증: 키 유일, 모든 assignment 가 키를 가리키는지, 조사원 id 중복 없음.
const keys = new Map();
for (const entry of data.procedures) {
  if (keys.has(entry.key)) throw new Error(`중복 key: ${entry.key}`);
  keys.set(entry.key, entry);
}
const seen = new Set();
for (const a of data.assignments) {
  if (!keys.has(a.procedureKey)) throw new Error(`알 수 없는 procedureKey: ${a.procedureKey}`);
  if (seen.has(a.researcherId)) throw new Error(`조사원 중복: ${a.researcherId}`);
  seen.add(a.researcherId);
}

const researchers = new Map((await call("GET", "/researchers")).map((r) => [r.id, r]));
const existing = await call("GET", "/procedures");
const byName = new Map(existing.map((p) => [p.name, p]));
const byId = new Map(existing.map((p) => [p.id, p]));

for (const a of data.assignments) {
  if (!researchers.has(a.researcherId)) throw new Error(`서버에 없는 조사원: ${a.researcherId} ${a.researcherName}`);
}

const stats = { researchers: data.assignments.length, newProcedures: 0, reusedExisting: 0, linksAdded: 0, defaultsSet: 0, skipped: 0, deleted: 0 };

if (UNDO) {
  console.log(`== UNDO (${DRY ? "DRY" : "실행"}) ${BASE}`);
  // 이 스크립트가 만든 프로시저 = reuseProcedureId 가 null 인 항목(이름으로 찾는다).
  const created = new Map();
  for (const entry of data.procedures) {
    if (entry.reuseProcedureId !== null) continue;
    const found = byName.get(entry.procedure.name);
    if (found) created.set(entry.key, found);
  }
  const createdIds = new Set([...created.values()].map((p) => p.id));
  for (const a of data.assignments) {
    const researcher = researchers.get(a.researcherId);
    const entry = keys.get(a.procedureKey);
    const reuseId = entry.reuseProcedureId;
    const mine = created.get(a.procedureKey);
    const nextIds = researcher.procedureIds.filter((id) => !createdIds.has(id));
    // 기본 지정은 이 스크립트가 지정한 프로시저(만든 것 또는 재사용 id)와 같을 때만 해제한다.
    const target = mine ? mine.id : reuseId;
    const clearDefault = researcher.defaultProcedureId != null && researcher.defaultProcedureId === target;
    const changed = nextIds.length !== researcher.procedureIds.length || clearDefault;
    if (!changed) {
      stats.skipped += 1;
      continue;
    }
    console.log(`조사원 ${a.researcherId} ${a.researcherName}: 연결 ${researcher.procedureIds.length}→${nextIds.length}, 기본 지정 ${clearDefault ? "해제" : "유지"}`);
    await write("PUT", `/researchers/${a.researcherId}`, researcherBody(researcher, nextIds, clearDefault ? null : (researcher.defaultProcedureId ?? null)), "연결·기본 지정 제거");
  }
  for (const [key, procedure] of created) {
    console.log(`프로시저 삭제 ${procedure.id} ${procedure.name} (key=${key})`);
    await write("DELETE", `/procedures/${procedure.id}`, undefined, "삭제");
    stats.deleted += 1;
  }
  console.log("== 요약", JSON.stringify(stats));
}

if (!UNDO) {
console.log(`== APPLY (${DRY ? "DRY: GET 만" : "실행"}) ${BASE}`);
// 1) 프로시저 확보: key -> id
const idOf = new Map();
for (const entry of data.procedures) {
  if (entry.reuseProcedureId !== null) {
    const found = byId.get(entry.reuseProcedureId);
    if (!found) throw new Error(`재사용할 프로시저 id ${entry.reuseProcedureId} 가 서버에 없다 (key=${entry.key})`);
    idOf.set(entry.key, found.id);
    stats.reusedExisting += 1;
    console.log(`재사용 key=${entry.key} -> id ${found.id} ${found.name}`);
    continue;
  }
  const found = byName.get(entry.procedure.name);
  if (found) {
    idOf.set(entry.key, found.id);
    stats.reusedExisting += 1;
    console.log(`재사용(같은 이름) key=${entry.key} -> id ${found.id} ${found.name}`);
    continue;
  }
  console.log(`새 프로시저 key=${entry.key} ${entry.procedure.name}`);
  const created = await write("POST", "/procedures", entry.procedure, entry.procedure.name);
  if (created) {
    if (typeof created.id !== "number") throw new Error(`POST /procedures 응답에 id 가 없다: ${JSON.stringify(created)}`);
    idOf.set(entry.key, created.id);
    byName.set(created.name, created);
  } else {
    idOf.set(entry.key, `<new:${entry.key}>`); // DRY 자리표시자
  }
  stats.newProcedures += 1;
}

// 2) 조사원별 연결 + 기본 지정
for (const a of data.assignments) {
  const researcher = researchers.get(a.researcherId);
  const procedureId = idOf.get(a.procedureKey);
  const hasLink = researcher.procedureIds.includes(procedureId);
  const nextIds = hasLink ? researcher.procedureIds : [...researcher.procedureIds, procedureId];
  const alreadyDefault = researcher.defaultProcedureId === procedureId;
  if (hasLink && alreadyDefault) {
    stats.skipped += 1;
    continue;
  }
  if (!hasLink) stats.linksAdded += 1;
  if (!alreadyDefault) stats.defaultsSet += 1;
  console.log(`조사원 ${a.researcherId} ${a.researcherName}: ${hasLink ? "연결 있음" : "연결 추가"}, 기본=${procedureId} (key=${a.procedureKey})`);
  await write("PUT", `/researchers/${a.researcherId}`, researcherBody(researcher, nextIds, procedureId), "연결·기본 지정");
}
console.log("== 요약", JSON.stringify(stats));
}
