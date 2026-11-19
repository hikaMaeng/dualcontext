import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createBuildPool, type BuildCallOptions, type BuildJob, type BuildPool } from "../../../workers/build/index.js";
import { createSearchPool } from "../../../workers/search/index.js";
import { isAbort } from "../../abort/index.js";
import type { Runner } from "../clone/index.js";
import { codebaseConfigSchema, collectCodebase } from "../index.js";
import { abortSharedBuilds, hasIndex, queryIndex } from "./index.js";
import { keyOf } from "../build.js";
import { indexPath, writeIndex } from "../store/index.js";

/** 호출 기록을 남기는 빌드 풀 감싸기(실제 스레드는 그대로 쓴다). */
function recordingPool(): { pool: BuildPool; runs: { job: BuildJob; options: BuildCallOptions }[] } {
  const inner = createBuildPool({ max: 1 });
  const runs: { job: BuildJob; options: BuildCallOptions }[] = [];
  return { runs, pool: { ...inner, run: (job, options) => { runs.push({ job, options }); return inner.run(job, options); } } };
}

async function workspace() {
  const data = await mkdtemp(path.join(os.tmpdir(), "aq-"));
  await mkdir(path.join(data, "repos", "app"), { recursive: true });
  await writeFile(path.join(data, "repos", "app", "login.ts"), "export function hashPassword(plain: string) {\n  return plain + 'salt';\n}\n");
  return { data, done: () => rm(data, { recursive: true, force: true }) };
}

const source = { source: "directory", path: "repos/app", topK: 3 } as const;
const until = async (check: () => Promise<boolean>, ms = 5000) => {
  const limit = Date.now() + ms;
  while (Date.now() < limit) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
};

test("코드베이스: 취소된 요청은 일반 실패로 삼키지 않고 취소 오류로 끝난다", async () => {
  const { data, done } = await workspace();
  const search = createSearchPool({ workers: 1 });
  try {
    const controller = new AbortController();
    controller.abort(Object.assign(new Error("cancelled"), { name: "RunAborted" }));
    await assert.rejects(collectCodebase(data, source, "hashPassword", { signal: controller.signal, searchPool: search }), (error) => isAbort(error));
  } finally {
    await search.close();
    await done();
  }
});

test("코드베이스: cold 빌드는 foreground, 같은 키의 동시 질의는 한 번의 빌드를 기다리고, 요청 취소는 공유 빌드를 죽이지 않는다", async () => {
  const { data, done } = await workspace();
  const { pool, runs } = recordingPool();
  const search = createSearchPool({ workers: 1 });
  try {
    const config = codebaseConfigSchema.parse(source);
    const request = new AbortController();
    const cancelled = collectCodebase(data, source, "hashPassword", { signal: request.signal, buildPool: pool, searchPool: search });
    const patient = collectCodebase(data, source, "hashPassword", { buildPool: pool, searchPool: search });
    // 두 요청이 모두 빌드를 기다리는 중에 한쪽을 취소한다.
    await new Promise((resolve) => setTimeout(resolve, 5));
    request.abort(Object.assign(new Error("cancelled"), { name: "RunAborted" }));
    await assert.rejects(cancelled, (error) => isAbort(error));
    const materials = await patient;
    assert.ok(materials.length > 0 && /hashPassword/.test(materials[0]?.title ?? ""));
    assert.equal(runs.length, 1, "같은 키의 빌드는 한 번뿐이다");
    assert.equal(runs[0]?.options.priority, "foreground");
    assert.equal(await hasIndex(data, config), true);
    assert.equal(runs[0]?.options.signal?.aborted, false, "빌드는 요청 신호가 아니라 자기 신호를 쓴다");
    assert.notEqual(runs[0]?.options.signal, request.signal);
  } finally {
    await pool.close();
    await search.close();
    await done();
  }
});

test("코드베이스: 인덱스가 있으면 파싱 없이 stat 으로 알고, 오래된 인덱스는 옛 것으로 먼저 답하며 background 로 갱신한다", async () => {
  const { data, done } = await workspace();
  const { pool, runs } = recordingPool();
  const search = createSearchPool({ workers: 1 });
  try {
    const config = codebaseConfigSchema.parse({ ...source, refreshHours: 1 });
    assert.equal(await hasIndex(data, config), false);
    const old = new Date(Date.now() - 3 * 3_600_000).toISOString();
    await writeIndex(data, keyOf(config), {
      version: 1, builtAt: old, source: { kind: "directory", label: "repos/app" }, stats: { files: 1, symbols: 1, callEdges: 0, importEdges: 0, skippedFiles: 0, truncated: false },
      files: [{ path: "login.ts", language: "typescript", lines: 3, imports: [] }],
      symbols: [{ id: 0, file: 0, name: "oldSymbol", kind: "function", line: 1, endLine: 3, snippet: "function oldSymbol() {}", calls: [], calledBy: [] }]
    });
    assert.equal(await hasIndex(data, config), true);
    const answer = await queryIndex(data, config, "oldSymbol", { buildPool: pool, searchPool: search });
    assert.equal(answer.builtAt, old, "오래됐어도 옛 인덱스로 먼저 답한다");
    assert.match(answer.materials[0]?.title ?? "", /oldSymbol/);
    assert.equal(await until(async () => runs.length === 1), true);
    assert.equal(runs[0]?.options.priority, "background", "갱신은 background 우선순위다");
    assert.equal(await until(async () => (await queryIndex(data, config, "hashPassword", { buildPool: pool, searchPool: search })).builtAt !== old), true, "갱신 뒤 새 세대를 읽는다");
  } finally {
    await pool.close();
    await search.close();
    await done();
  }
});

test("코드베이스: 빌드가 실패하면 60초 동안 같은 오류를 바로 돌려주고 다시 만들지 않는다", async () => {
  const { data, done } = await workspace();
  const { pool, runs } = recordingPool();
  const search = createSearchPool({ workers: 1 });
  try {
    const missing = { source: "directory", path: "repos/none", topK: 3 };
    await assert.rejects(collectCodebase(data, missing, "x", { buildPool: pool, searchPool: search }), /ENOENT|no such file|escapes|not a directory/i);
    const before = runs.length;
    await assert.rejects(collectCodebase(data, missing, "x", { buildPool: pool, searchPool: search }), Error);
    assert.equal(runs.length, before, "백오프 중에는 빌드하지 않는다");
  } finally {
    await pool.close();
    await search.close();
    await done();
  }
});

test("코드베이스 git 소스: 클론은 메인에서 하고 빌드 스레드가 스캔하며, 작업 폴더는 부모가 지운다", async () => {
  const { data, done } = await workspace();
  const { pool, runs } = recordingPool();
  const search = createSearchPool({ workers: 1 });
  try {
    const destinations: string[] = [];
    const run: Runner = async (args) => {
      if (args.includes("clone")) {
        const destination = args[args.length - 1] as string;
        destinations.push(destination);
        await mkdir(path.join(destination, "src"), { recursive: true });
        await writeFile(path.join(destination, "src", "auth.ts"), "export function verifyToken(token: string) {\n  return token.length > 3;\n}\n");
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 0, stdout: `${"a".repeat(40)}\n`, stderr: "" };
    };
    const git = { source: "git", url: "https://github.com/o/r", subPath: "src", topK: 3 };
    const materials = await collectCodebase(data, git, "verifyToken", { run, resolver: async () => ["140.82.112.3"], buildPool: pool, searchPool: search });
    assert.match(materials[0]?.title ?? "", /auth\.ts:1-\d+ function verifyToken/);
    assert.equal(runs.length, 1);
    assert.equal(destinations.length, 1);
    assert.ok(destinations[0]?.includes(`.work-${runs[0]?.job.jobId}`), "작업 폴더 이름은 작업 id 로 나뉜다");
    const left = await readdir(path.dirname(indexPath(data, keyOf(codebaseConfigSchema.parse(git)))));
    assert.deepEqual(left.sort(), ["index.json"]);
    assert.deepEqual((await readdir(path.join(data, "codebase"))).filter((name) => name.includes(".work-")), []);
  } finally {
    await pool.close();
    await search.close();
    await done();
  }
});

test("코드베이스: 종료 신호(abortSharedBuilds)는 클론 자식을 끝내고 작업 폴더를 지우며 취소로 끝난다", async () => {
  const { data, done } = await workspace();
  const { pool } = recordingPool();
  const search = createSearchPool({ workers: 1 });
  try {
    let received: AbortSignal | undefined;
    const run: Runner = (args, _env, options) =>
      new Promise((_, reject) => {
        const destination = args[args.length - 1] as string;
        received = options.signal;
        void mkdir(destination, { recursive: true });
        options.signal?.addEventListener("abort", () => reject(options.signal?.reason as Error), { once: true });
      });
    const git = { source: "git", url: "https://github.com/o/stuck", topK: 3 };
    const pending = collectCodebase(data, git, "x", { run, resolver: async () => ["140.82.112.3"], buildPool: pool, searchPool: search });
    const outcome = pending.then(() => "resolved", (error: Error) => error);
    assert.equal(await until(async () => received !== undefined), true);
    abortSharedBuilds();
    const error = await outcome;
    assert.ok(error instanceof Error && isAbort(error));
    assert.deepEqual((await readdir(path.join(data, "codebase"))).filter((name) => name.includes(".work-")), [], "작업 폴더를 지웠다");
  } finally {
    await pool.close();
    await search.close();
    await done();
  }
});
