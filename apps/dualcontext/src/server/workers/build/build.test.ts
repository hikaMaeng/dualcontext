import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isAbort } from "../../collect/abort/index.js";
import type { BuildJob } from "./index.js";
import { createBuildPool } from "./index.js";

const fixtureUrl = new URL("../testing/build-fixture.ts", import.meta.url);
const job = (jobId: string, root: string): BuildJob => ({ jobId, root, source: { kind: "directory", label: "x" }, limits: { maxFiles: 10, maxFileBytes: 1000, maxTotalBytes: 10_000, deadline: Date.now() + 30_000 }, dataDir: os.tmpdir(), key: "k" });
const settle = <T>(promise: Promise<T>) => promise.then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));

test("cpu.build: 실제 빌드 스레드가 스캔 · 그래프 · 인덱스 쓰기를 하고 임시 파일을 남기지 않는다", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "bw-"));
  const pool = createBuildPool({ max: 1 });
  try {
    const root = path.join(data, "repo");
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "a.ts"), "export function alpha() {\n  return beta();\n}\nexport function beta() {\n  return 1;\n}\n");
    const real = { ...job("job-real", root), dataDir: data, key: "abc123", limits: { maxFiles: 10, maxFileBytes: 100_000, maxTotalBytes: 1_000_000, deadline: Date.now() + 30_000 } };
    const outcome = await pool.run(real, { timeoutMs: 30_000 });
    assert.equal(outcome.stats.symbols, 2);
    assert.equal(outcome.stats.callEdges, 1);
    const written = JSON.parse(await readFile(path.join(data, "codebase", "abc123", "index.json"), "utf8")) as { builtAt: string };
    assert.equal(written.builtAt, outcome.builtAt);
    assert.deepEqual((await readdir(path.join(data, "codebase", "abc123"))).sort(), ["index.json"], "작업 id 로 나뉜 임시 파일이 남지 않는다");
    await assert.rejects(pool.run({ ...real, jobId: "job-missing", root: path.join(data, "none") }, { timeoutMs: 30_000 }), /ENOENT|no such file/i);
    assert.equal(pool.stats().running, 0);
  } finally {
    await pool.close();
    await rm(data, { recursive: true, force: true });
  }
});

test("cpu.build: 동시 작업 수는 max 이하이고, 질의 경로(foreground)가 갱신(background)보다 먼저 슬롯을 가져간다", async () => {
  const pool = createBuildPool({ max: 1, url: fixtureUrl });
  try {
    const finished: string[] = [];
    const track = (id: string, root: string, priority: "foreground" | "background") => pool.run(job(id, root), { timeoutMs: 30_000, priority }).then(() => void finished.push(id));
    const running = track("A-bg-running", "sleep:300", "background");
    // A 가 슬롯을 쥔 뒤에 두 작업이 대기열에 들어간다.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const waitingBackground = track("B-bg-waiting", "sleep:10", "background");
    const waitingForeground = track("C-fg-waiting", "sleep:10", "foreground");
    assert.equal(pool.stats().running, 1);
    assert.deepEqual([pool.stats().queuedForeground, pool.stats().queuedBackground], [1, 1]);
    await Promise.all([running, waitingBackground, waitingForeground]);
    assert.deepEqual(finished, ["A-bg-running", "C-fg-waiting", "B-bg-waiting"]);

    const first = track("D-bg", "sleep:200", "background");
    await new Promise((resolve) => setTimeout(resolve, 30));
    const second = track("E-bg-promoted", "sleep:10", "background");
    const third = track("F-fg", "sleep:10", "foreground");
    assert.equal(pool.promote("E-bg-promoted"), true);
    await Promise.all([first, second, third]);
    assert.deepEqual(finished.slice(3), ["D-bg", "F-fg", "E-bg-promoted"], "올린 작업은 foreground 대기열의 뒤에 붙는다");
  } finally {
    await pool.close();
  }
});

test("cpu.build: 취소는 스레드를 끝내고 종료 확인 뒤에 거절하며, 대기 중 취소는 큐에서 빠지고, 풀은 이어서 일한다", async () => {
  const pool = createBuildPool({ max: 1, url: fixtureUrl });
  try {
    const controller = new AbortController();
    const hung = settle(pool.run(job("hang", "hang"), { timeoutMs: 30_000, signal: controller.signal }));
    const queuedController = new AbortController();
    const queued = settle(pool.run(job("queued", "sleep:10"), { timeoutMs: 30_000, signal: queuedController.signal }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    queuedController.abort();
    controller.abort(Object.assign(new Error("cancelled"), { name: "RunAborted" }));
    const [first, second] = await Promise.all([hung, queued]);
    assert.ok(!first.ok && isAbort(first.error));
    assert.ok(!second.ok && isAbort(second.error));
    assert.equal(pool.stats().running, 0, "거절을 받은 시점에는 스레드가 이미 끝났다");
    assert.equal(pool.stats().killed >= 1, true);
    await pool.run(job("after", "sleep:5"), { timeoutMs: 30_000 });
  } finally {
    await pool.close();
  }
});

test("cpu.build: 시한을 넘기면 스레드를 끝내고 time limit 오류로 거절하고, 스레드가 실패를 알려도 풀은 살아 있다", async () => {
  const pool = createBuildPool({ max: 2, url: fixtureUrl });
  try {
    const started = performance.now();
    await assert.rejects(pool.run(job("slow", "hang"), { timeoutMs: 200 }), /time limit/);
    assert.ok(performance.now() - started < 5000);
    assert.equal(pool.stats().running, 0);
    await assert.rejects(pool.run(job("bad", "fail"), { timeoutMs: 30_000 }), /fixture failure/);
    assert.equal((await pool.run(job("ok", "sleep:5"), { timeoutMs: 30_000 })).builtAt, "ok");
  } finally {
    await pool.close();
  }
});

test("cpu.build: 풀을 닫으면 실행 중 스레드를 끝내고 대기 작업을 거절한다", async () => {
  const pool = createBuildPool({ max: 1, url: fixtureUrl });
  const running = settle(pool.run(job("run", "hang"), { timeoutMs: 30_000 }));
  const waiting = settle(pool.run(job("wait", "sleep:10"), { timeoutMs: 30_000 }));
  await new Promise((resolve) => setTimeout(resolve, 150));
  await pool.close();
  const [first, second] = await Promise.all([running, waiting]);
  assert.ok(!first.ok && /closed/.test((first.error as Error).message));
  assert.ok(!second.ok && /closed/.test((second.error as Error).message));
  await assert.rejects(pool.run(job("late", "sleep:1"), { timeoutMs: 1000 }), /closed/);
});
