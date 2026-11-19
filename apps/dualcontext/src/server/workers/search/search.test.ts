import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isAbort } from "../../collect/abort/index.js";
import type { CodeIndex } from "../../collect/codebase/model/index.js";
import { createEngine } from "./engine.js";
import { createSearchPool, slotOf } from "./index.js";
import type { SearchRequest } from "./protocol.js";

const fixtureUrl = new URL("../testing/search-fixture.ts", import.meta.url);

function makeIndex(symbols: number, builtAt: string, word = "needle"): CodeIndex {
  return {
    version: 1,
    builtAt,
    source: { kind: "directory", label: "x" },
    stats: { files: 1, symbols, callEdges: 0, importEdges: 0, skippedFiles: 0, truncated: false },
    files: [{ path: "src/a.ts", language: "typescript", lines: 10, imports: [] }],
    symbols: Array.from({ length: symbols }, (_, id) => ({
      id, file: 0, name: id === 0 ? word : `fn${id}`, kind: "function" as const, line: id + 1, endLine: id + 2, snippet: `function ${id === 0 ? word : `fn${id}`}() { return ${"token ".repeat(30)}${id}; }`, calls: [], calledBy: []
    }))
  };
}

async function workspace() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sw-"));
  const write = async (name: string, index: CodeIndex) => {
    const file = path.join(dir, name);
    await writeFile(file, JSON.stringify(index));
    return file;
  };
  return { dir, write, done: () => rm(dir, { recursive: true, force: true }) };
}

const request = (file: string, query: string, flag = new Int32Array(new SharedArrayBuffer(4))): SearchRequest => ({ id: "r", cancel: flag.buffer as SharedArrayBuffer, file, cacheKey: file, query, topK: 3 });
const flagOf = (request: SearchRequest) => new Int32Array(request.cancel);

test("엔진: 없는 파일 · 깨진 파일은 absent 이고, 같은 세대는 캐시(warm), 파일이 바뀌면 다시 읽는다", async () => {
  const space = await workspace();
  try {
    const engine = createEngine({ budgetBytes: 100 * 1024 * 1024 });
    const file = await space.write("a.json", makeIndex(50, "2026-01-01T00:00:00.000Z"));
    assert.deepEqual(await engine.run(request(path.join(space.dir, "none.json"), "needle"), new Int32Array(new SharedArrayBuffer(4))), { id: "r", type: "absent", reason: "missing" });

    const first = request(file, "needle");
    const cold = await engine.run(first, flagOf(first));
    assert.equal(cold.type, "found");
    if (cold.type !== "found") return;
    assert.equal(cold.stats.warm, false);
    assert.match(cold.materials[0]?.title ?? "", /needle/);
    assert.equal(cold.scores.length, cold.materials.length);

    const second = request(file, "needle");
    const warm = await engine.run(second, flagOf(second));
    assert.ok(warm.type === "found" && warm.stats.warm && warm.builtAt === cold.builtAt);

    await writeFile(file, JSON.stringify(makeIndex(60, "2026-02-02T00:00:00.000Z", "haystack")));
    const third = request(file, "haystack");
    const changed = await engine.run(third, flagOf(third));
    assert.ok(changed.type === "found" && !changed.stats.warm && changed.builtAt === "2026-02-02T00:00:00.000Z" && /haystack/.test(changed.materials[0]?.title ?? ""), "세대(mtime · size · ino)가 달라지면 새로 읽는다");

    await writeFile(file, "{ not json");
    const broken = request(file, "needle");
    assert.deepEqual(await engine.run(broken, flagOf(broken)), { id: "r", type: "absent", reason: "invalid" });
  } finally {
    await space.done();
  }
});

test("엔진: 캐시 예산은 바이트 기준 LRU 이고, 방금 넣은 항목 하나는 예산을 넘어도 남는다", async () => {
  const space = await workspace();
  try {
    const files = await Promise.all(["a", "b", "c"].map((name) => space.write(`${name}.json`, makeIndex(200, `2026-01-0${name === "a" ? 1 : name === "b" ? 2 : 3}T00:00:00.000Z`))));
    const { size } = await import("node:fs/promises").then((fs) => fs.stat(files[0] as string));
    const engine = createEngine({ budgetBytes: size * 4 * 2 + 10 });
    for (const file of files) {
      const call = request(file, "needle");
      await engine.run(call, flagOf(call));
    }
    assert.equal(engine.stats().entries, 2, "예산이 두 개 몫이라 가장 오래된 하나가 밀려났다");
    const again = request(files[2] as string, "needle");
    const warm = await engine.run(again, flagOf(again));
    assert.ok(warm.type === "found" && warm.stats.warm);
    const oldest = request(files[0] as string, "needle");
    const evicted = await engine.run(oldest, flagOf(oldest));
    assert.ok(evicted.type === "found" && !evicted.stats.warm);

    const tiny = createEngine({ budgetBytes: 1 });
    const call = request(files[1] as string, "needle");
    await tiny.run(call, flagOf(call));
    assert.equal(tiny.stats().entries, 1);
  } finally {
    await space.done();
  }
});

test("엔진: 취소 플래그가 켜져 있으면 구축 · 검색 전에 cancelled 로 멈춘다", async () => {
  const space = await workspace();
  try {
    const engine = createEngine({ budgetBytes: 100 * 1024 * 1024 });
    const file = await space.write("big.json", makeIndex(3000, "2026-01-01T00:00:00.000Z"));
    const flag = new Int32Array(new SharedArrayBuffer(4));
    Atomics.store(flag, 0, 1);
    assert.deepEqual(await engine.run(request(file, "needle", flag), flag), { id: "r", type: "cancelled" });
    assert.equal(engine.stats().entries, 0);
  } finally {
    await space.done();
  }
});

test("색인 키 해시는 같은 키를 항상 같은 스레드에 고정하고 키를 스레드들에 나눈다", () => {
  assert.equal(slotOf("/data/codebase/a/index.json", 4), slotOf("/data/codebase/a/index.json", 4));
  const used = new Set(Array.from({ length: 64 }, (_, i) => slotOf(`/data/codebase/${i}/index.json`, 4)));
  assert.equal(used.size, 4);
  assert.equal(slotOf("anything", 1), 0);
});

test("cpu.search 스레드: 실제 스레드가 색인을 읽고 topK 자료만 돌려주며, 두 번째는 warm 이고 파일이 바뀌면 다시 읽는다", async () => {
  const space = await workspace();
  const pool = createSearchPool({ workers: 2 });
  try {
    const file = await space.write("a.json", makeIndex(80, "2026-01-01T00:00:00.000Z"));
    const query = { file, cacheKey: file, query: "needle", topK: 2 };
    const cold = await pool.search(query);
    assert.ok(cold.type === "found" && !cold.stats.warm && cold.materials.length <= 2 && /needle/.test(cold.materials[0]?.title ?? ""));
    const warm = await pool.search(query);
    assert.ok(warm.type === "found" && warm.stats.warm);
    await writeFile(file, JSON.stringify(makeIndex(80, "2026-03-03T00:00:00.000Z")));
    const rebuilt = await pool.search(query);
    assert.ok(rebuilt.type === "found" && !rebuilt.stats.warm && rebuilt.builtAt === "2026-03-03T00:00:00.000Z");
    const gone = await pool.search({ ...query, file: path.join(space.dir, "none.json"), cacheKey: "none" });
    assert.ok(gone.type === "absent" && gone.reason === "missing");
  } finally {
    await pool.close();
    await space.done();
  }
});

test("cpu.search 스레드: 대기 중 취소는 큐에서 빠지고, 실행 중 취소는 플래그로 협력 취소되며 같은 스레드가 계속 쓰인다", async () => {
  const space = await workspace();
  const pool = createSearchPool({ workers: 1 });
  try {
    const big = await space.write("big.json", makeIndex(60_000, "2026-01-01T00:00:00.000Z"));
    const small = await space.write("small.json", makeIndex(10, "2026-01-01T00:00:00.000Z"));
    const controller = new AbortController();
    const running = pool.search({ file: big, cacheKey: big, query: "needle", topK: 3 }, { signal: controller.signal });
    const queuedController = new AbortController();
    const queued = pool.search({ file: small, cacheKey: small, query: "needle", topK: 3 }, { signal: queuedController.signal });
    queuedController.abort();
    await assert.rejects(queued, (error) => isAbort(error));
    const started = performance.now();
    setTimeout(() => controller.abort(Object.assign(new Error("cancelled"), { name: "RunAborted" })), 30);
    await assert.rejects(running, (error) => isAbort(error));
    assert.ok(performance.now() - started < 4000);
    assert.ok(pool.stats().cancelled >= 2);
    const after = await pool.search({ file: small, cacheKey: small, query: "needle", topK: 3 });
    assert.equal(after.type, "found");
    assert.equal(pool.stats().restarts, 0, "협력 취소는 스레드를 죽이지 않는다");
  } finally {
    await pool.close();
    await space.done();
  }
});

test("cpu.search 스레드: 스레드가 죽으면 실행 중 작업만 실패하고 다음 작업은 새 스레드가 처리한다", async () => {
  const pool = createSearchPool({ workers: 1, url: fixtureUrl });
  try {
    const query = (text: string) => ({ file: "/none", cacheKey: "k", query: text, topK: 1 });
    const crashing = pool.search(query("crash"));
    const waiting = pool.search(query("echo:after"));
    await assert.rejects(crashing, /search worker stopped/);
    const answer = await waiting;
    assert.ok(answer.type === "found" && answer.materials[0]?.title === "echo:after");
    assert.equal(pool.stats().restarts, 1);
  } finally {
    await pool.close();
  }
});

test("cpu.search 스레드: 힙 상한을 넘겨 OOM 으로 죽어도 풀은 새 스레드로 복구한다(resourceLimits)", async () => {
  const space = await workspace();
  const pool = createSearchPool({ workers: 1, heapMb: 64 });
  try {
    const heavy = makeIndex(80_000, "2026-01-01T00:00:00.000Z");
    for (const symbol of heavy.symbols) symbol.snippet = `function ${symbol.name}() { tok${symbol.id} ${"word ".repeat(80)} }`;
    const big = await space.write("heavy.json", heavy);
    const small = await space.write("small.json", makeIndex(10, "2026-01-01T00:00:00.000Z"));
    await assert.rejects(pool.search({ file: big, cacheKey: big, query: "fn1", topK: 2 }), /search worker stopped.*memory/);
    assert.equal(pool.stats().restarts, 1);
    assert.equal((await pool.search({ file: small, cacheKey: small, query: "needle", topK: 2 })).type, "found");
  } finally {
    await pool.close();
    await space.done();
  }
});

test("cpu.search 스레드: 취소 플래그를 못 보는 스레드는 유예 시간 뒤 끝내고 다시 띄운다", async () => {
  const pool = createSearchPool({ workers: 1, url: fixtureUrl, cancelGraceMs: 100 });
  try {
    const controller = new AbortController();
    const hung = pool.search({ file: "/none", cacheKey: "k", query: "hang", topK: 1 }, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const started = performance.now();
    controller.abort();
    await assert.rejects(hung, (error) => isAbort(error));
    assert.ok(performance.now() - started < 2500, "3초 동기 구간을 기다리지 않고 스레드를 끝냈다");
    const next = await pool.search({ file: "/none", cacheKey: "k", query: "echo:ok", topK: 1 });
    assert.equal(next.type, "found");
  } finally {
    await pool.close();
  }
});

test("cpu.search 스레드: 닫은 풀은 새 작업을 거절하고 대기 작업을 거절한다", async () => {
  const pool = createSearchPool({ workers: 1, url: fixtureUrl });
  const outcome = (promise: Promise<unknown>) => promise.then(() => "resolved", (error: Error) => error.message);
  const running = outcome(pool.search({ file: "/none", cacheKey: "k", query: "hang", topK: 1 }));
  const waiting = outcome(pool.search({ file: "/none", cacheKey: "k", query: "echo:x", topK: 1 }));
  await new Promise((resolve) => setTimeout(resolve, 200));
  await pool.close();
  assert.match(await running, /closed/);
  assert.match(await waiting, /closed/);
  await assert.rejects(pool.search({ file: "/none", cacheKey: "k", query: "echo:y", topK: 1 }), /closed/);
});
