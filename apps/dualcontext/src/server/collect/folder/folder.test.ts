import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isAbort } from "../abort/index.js";
import { budgetFor, defaultRunBudgetBytes } from "./budget.js";
import { collectFolder } from "./index.js";

type Recorded = { texts: string[]; names: string[][]; bodies: string[][] };

/** 연결을 체크아웃하는 가짜 풀: `set local statement_timeout` 이 같은 연결에서 먼저 나가는지도 기록한다. */
function fakePool() {
  const recorded: Recorded = { texts: [], names: [], bodies: [] };
  const client = {
    async query(text: string, params?: unknown[]) {
      recorded.texts.push(text.trim().split("\n")[0] as string);
      if (params !== undefined) {
        recorded.names.push(params[1] as string[]);
        recorded.bodies.push(params[2] as string[]);
      }
      return { rows: [] };
    },
    release() {
      recorded.texts.push("release");
    }
  };
  return { pool: { connect: async () => client } as never, recorded };
}

const skip = process.platform === "win32" ? "폴더 조사원은 리눅스 컨테이너 전용 posix 경로 규칙이라 윈도우 호스트에서는 건너뜀(컨테이너에서 검증)" : false;

async function folderWith(files: Record<string, string>) {
  const data = await mkdtemp(path.join(os.tmpdir(), "fo-"));
  await mkdir(path.join(data, "docs"), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(data, "docs", name), text);
  return { data, done: () => rm(data, { recursive: true, force: true }) };
}

test("폴더 예산: 기본 20MB, 환경 변수로 바꾸고, 같은 실행 신호는 같은 예산을 나눠 쓰며 신호가 없으면 호출마다 새 예산이다", () => {
  assert.equal(defaultRunBudgetBytes({}), 20 * 1024 * 1024);
  assert.equal(defaultRunBudgetBytes({ DUALCONTEXT_FOLDER_RUN_MB: "5" }), 5 * 1024 * 1024);
  assert.equal(defaultRunBudgetBytes({ DUALCONTEXT_FOLDER_RUN_MB: "x" }), 20 * 1024 * 1024);
  const run = new AbortController();
  const first = budgetFor(run.signal, 100);
  first.remaining -= 30;
  assert.equal(budgetFor(run.signal, 100).remaining, 70, "같은 실행(같은 신호)은 한 예산");
  assert.equal(budgetFor(new AbortController().signal, 100).remaining, 100, "다른 실행은 새 예산");
  assert.equal(budgetFor(undefined, 100).remaining, 100);
});

test("폴더 조사원: 실행 단위 총 바이트 예산 안에서만 읽고, 예산보다 큰 파일은 건너뛰되 작은 파일은 계속 읽는다", { skip }, async () => {
  const kilo = (n: number) => "가".repeat(Math.floor((n * 1024) / 3));
  const { data, done } = await folderWith({ "a.md": kilo(600), "b.md": kilo(600), "c.md": "작은 파일" });
  try {
    const previous = process.env.DUALCONTEXT_FOLDER_RUN_MB;
    process.env.DUALCONTEXT_FOLDER_RUN_MB = "1";
    try {
      const run = new AbortController();
      const first = fakePool();
      await collectFolder(first.pool, data, { path: "docs" }, "질의", run.signal);
      assert.deepEqual(first.recorded.names[0]?.slice().sort(), ["a.md", "c.md"], "두 번째 600KB 파일은 예산(1MB)을 넘어 건너뛴다");
      const second = fakePool();
      await collectFolder(second.pool, data, { path: "docs" }, "질의", run.signal);
      assert.deepEqual(second.recorded.names[0], ["c.md"], "같은 실행의 두 번째 폴더 조사원은 남은 예산(약 424KB)이 부족해 큰 파일을 읽지 못하고 작은 파일만 읽는다");
    } finally {
      if (previous === undefined) delete process.env.DUALCONTEXT_FOLDER_RUN_MB;
      else process.env.DUALCONTEXT_FOLDER_RUN_MB = previous;
    }
  } finally {
    await done();
  }
});

test("폴더 조사원: 검색 쿼리는 begin → set local statement_timeout 뒤 같은 연결에서 나가고 연결을 돌려준다", { skip }, async () => {
  const { data, done } = await folderWith({ "a.md": "내용이 있는 파일" });
  try {
    const { pool, recorded } = fakePool();
    await collectFolder(pool, data, { path: "docs" }, "질의");
    assert.deepEqual(recorded.texts.slice(0, 3), ["begin", "set local statement_timeout = 30000", "with q as (select replace(plainto_tsquery('korean', $1)::text, '&', '|')::tsquery as tsq),"]);
    assert.deepEqual(recorded.texts.slice(3), ["commit", "release"]);
  } finally {
    await done();
  }
});

test("폴더 조사원: 파일 사이에서 취소를 확인한다(이미 취소됐으면 읽지 않고 취소 오류)", { skip }, async () => {
  const { data, done } = await folderWith({ "a.md": "x", "b.md": "y" });
  try {
    const controller = new AbortController();
    controller.abort(Object.assign(new Error("cancelled"), { name: "RunAborted" }));
    const { pool, recorded } = fakePool();
    await assert.rejects(collectFolder(pool, data, { path: "docs" }, "질의", controller.signal), (error) => isAbort(error));
    assert.deepEqual(recorded.texts, [], "DB 에는 아무것도 보내지 않았다");
  } finally {
    await done();
  }
});
