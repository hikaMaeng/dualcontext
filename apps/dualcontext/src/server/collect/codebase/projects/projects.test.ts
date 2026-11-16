import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { codebaseConfigSchema, collectCodebase } from "../index.js";
import { listProjects, namedIn } from "./discover.js";

async function workspace() {
  const data = await mkdtemp(path.join(os.tmpdir(), "dc-projects-"));
  const write = async (project: string, file: string, text: string) => {
    await mkdir(path.join(data, "workspace", project), { recursive: true });
    await writeFile(path.join(data, "workspace", project, file), text);
  };
  await write("authsvc", "login.ts", "export function hashPassword(plain: string) { return plain + 'salt'; }\n");
  await write("billing", "invoice.ts", "export function totalInvoice(items: number[]) { return items.reduce((a, b) => a + b, 0); }\n");
  await mkdir(path.join(data, "workspace", ".hidden"), { recursive: true });
  await mkdir(path.join(data, "workspace", "node_modules"), { recursive: true });
  return data;
}

test("하위 폴더 나열: 숨김 폴더와 node_modules 는 프로젝트가 아니다", async () => {
  const data = await workspace();
  try {
    assert.deepEqual(await listProjects(path.join(data, "workspace")), ["authsvc", "billing"]);
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});

test("질의 속 프로젝트 이름: 단어가 같을 때만 고르고 부분 일치 · 짧은 이름은 고르지 않는다", () => {
  const names = ["p4", "p4studio", "vibeagent", "RLVR"];
  assert.deepEqual(namedIn("vibeagent 에서 turn loop 를 분석", names), ["vibeagent"]);
  assert.deepEqual(namedIn("p4studio 설정", names), ["p4studio"]);
  assert.deepEqual(namedIn("rlvr reward 계산", names), ["RLVR"]);
  assert.deepEqual(namedIn("p4 위에서 동작하는 도구", names), []);
  assert.deepEqual(namedIn("vibeagents 는?", names), []);
});

test("projects 설정은 directory 전용이다", () => {
  assert.ok(codebaseConfigSchema.safeParse({ source: "directory", path: "workspace", projects: true }).success);
  assert.ok(!codebaseConfigSchema.safeParse({ source: "git", url: "https://github.com/a/b", projects: true }).success);
});

test("이름이 나오면 그 프로젝트만 읽고 제목에 프로젝트 이름을 붙인다", async () => {
  const data = await workspace();
  try {
    const materials = await collectCodebase(data, { source: "directory", path: "workspace", projects: true, topK: 3 }, "billing invoice total");
    assert.ok(materials.length > 0);
    assert.ok(materials.every((material) => material.title.startsWith("[billing] ")));
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});

test("이름이 없으면 이미 인덱스가 있는 프로젝트를 합쳐 읽는다", async () => {
  const data = await workspace();
  try {
    const config = { source: "directory", path: "workspace", projects: true, topK: 5 };
    await collectCodebase(data, config, "authsvc login");
    await collectCodebase(data, config, "billing invoice");
    const materials = await collectCodebase(data, config, "hashPassword plain salt");
    assert.ok(materials.length > 0);
    assert.ok(materials[0]?.title.startsWith("[authsvc] "));
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});

test("볼륨 밖 경로는 거부한다", async () => {
  const data = await workspace();
  try {
    await assert.rejects(collectCodebase(data, { source: "directory", path: "../etc", projects: true }, "x"), Error);
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});
