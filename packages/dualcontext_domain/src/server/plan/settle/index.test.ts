import assert from "node:assert/strict";
import test from "node:test";
import { RunAborted } from "../../../common/index.js";
import { settleAll } from "./index.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("settleAll: 한 분기가 먼저 실패해도 시작한 분기가 전부 정착한 뒤에 거부한다", async () => {
  let slowDone = false;
  const slow = wait(30).then(() => { slowDone = true; });
  await assert.rejects(settleAll([Promise.reject(new Error("빠른 실패")), slow]), /빠른 실패/);
  assert.equal(slowDone, true, "느린 분기가 끝나기 전에 거부하면 고아 작업이 남는다");
});

test("settleAll: 일반 실패와 RunAborted 가 섞이면 RunAborted 가 이긴다", async () => {
  const error = await settleAll([Promise.reject(new Error("일반")), Promise.reject(new RunAborted("deadline"))]).catch((caught: unknown) => caught);
  assert.ok(error instanceof RunAborted);
  assert.equal((error as RunAborted).reason, "deadline");
});

test("settleAll: 모두 성공하면 입력 순서로 값을 돌려준다", async () => {
  assert.deepEqual(await settleAll([wait(20).then(() => 1), Promise.resolve(2)]), [1, 2]);
});
