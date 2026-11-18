import express from "express";
import type { Deps } from "../../augment/index.js";
import { bus, readRun } from "./lifecycle/index.js";
import { readNode, validNodeKey } from "./nodes/index.js";
import { EmbeddingUnavailable, listRuns } from "./list/index.js";
import { readFilterOptions } from "./list/filters/index.js";
import { parseListParams } from "./list/params/index.js";

export { abandonRunningRuns, startRun } from "./lifecycle/index.js";
export { backfillInBackground, startupBackfillLimit } from "./embedding/index.js";

export function runsRouter(deps: Deps) {
  const router = express.Router();

  // 목록: 필터(조사원·프로시저, 종류 안 OR)와 검색어(q, keyword|semantic)는 AND, 쪽 단위로 돌려준다. 응답은 RunListPage.
  router.get("/runs", async (request, response) => {
    const parsed = parseListParams(request.query);
    if (!parsed.ok) return void response.status(400).json({ error: parsed.error });
    try {
      response.json(await listRuns(deps.pool, deps.model, parsed.params));
    } catch (caught) {
      if (caught instanceof EmbeddingUnavailable) return void response.status(503).json({ error: caught.message });
      throw caught;
    }
  });

  // 필터에 쓸 이름들. /runs/:id 보다 먼저 선언해야 "filters" 가 id 로 잡히지 않는다.
  router.get("/runs/filters", async (_request, response) => {
    response.json(await readFilterOptions(deps.pool));
  });

  // 폴링용: 현재 상태 전체. running 이면 같은 주소를 다시 부르면 된다.
  router.get("/runs/:id", async (request, response) => {
    const detail = await readRun(deps.pool, Number(request.params.id));
    if (!detail) return void response.status(404).json({ error: "not found" });
    response.json(detail);
  });

  // 노드 상세(프롬프트 · 라우팅 · 조사원 · 사전 컨텍스트). 키는 URL 인코딩된 노드 키(`item:i3` 의 ':' 포함). 아직 만들어지지 않았으면 404.
  router.get("/runs/:id/nodes/:key", async (request, response) => {
    const id = Number(request.params.id);
    const key = request.params.key;
    if (!Number.isInteger(id) || !validNodeKey(key)) return void response.status(400).json({ error: "invalid key" });
    const node = await readNode(deps.pool, id, key);
    if (!node) return void response.status(404).json({ error: "not found" });
    response.json(node);
  });

  // 실시간용(SSE): 상태가 바뀔 때마다 상세 행 전체를 보내고, 끝나면 스트림을 닫는다.
  router.get("/runs/:id/events", async (request, response) => {
    const id = Number(request.params.id);
    // 구독을 먼저 걸고 현재 상태를 읽는다. 그 사이에 바뀐 상태를 놓치지 않기 위해서다(중복 전송은 해롭지 않다).
    const pending: { status: string }[] = [];
    let live = false;
    // 같은 내용을 두 번 보내지 않는다(아래 watch 가 주기적으로 같은 행을 읽는다).
    let lastSent = "";
    const send = (detail: unknown) => {
      const json = JSON.stringify(detail);
      if (json === lastSent) return;
      lastSent = json;
      response.write(`data: ${json}\n\n`);
    };
    const onUpdate = (detail: { status: string }) => {
      if (!live) return void pending.push(detail);
      send(detail);
      if (detail.status !== "running") finish();
    };
    const beat = setInterval(() => response.write(": keep-alive\n\n"), 15_000);
    // MCP 호출은 별개 프로세스가 쓰므로 이 프로세스의 bus 로는 변화가 오지 않는다. 같은 행을 주기적으로 읽어 바뀌었으면 보낸다.
    const watch = setInterval(async () => {
      if (!live) return;
      try {
        const detail = await readRun(deps.pool, id);
        if (detail) onUpdate(detail);
      } catch {
        // 읽기 실패는 다음 주기에 다시 시도한다.
      }
    }, 2_000);
    function finish() {
      clearInterval(watch);
      clearInterval(beat);
      bus.off(String(id), onUpdate);
      response.end();
    }
    bus.on(String(id), onUpdate);
    request.on("close", finish);

    const first = await readRun(deps.pool, id);
    if (!first) {
      clearInterval(watch);
      clearInterval(beat);
      bus.off(String(id), onUpdate);
      return void response.status(404).json({ error: "not found" });
    }
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
    send(first);
    live = true;
    for (const detail of pending) send(detail);
    // 가장 최근 상태가 끝난 상태면 더 보낼 것이 없다.
    if ((pending.at(-1)?.status ?? first.status) !== "running") finish();
  });

  router.delete("/runs/:id", async (request, response) => {
    const id = Number(request.params.id);
    const { rowCount } = await deps.pool.query("delete from augment_runs where id = $1 and status <> 'running'", [id]);
    if (rowCount === 0 && (await readRun(deps.pool, id))) return void response.status(409).json({ error: "run is still running" });
    response.status(204).end();
  });

  return router;
}
