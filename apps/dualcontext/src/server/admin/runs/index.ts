import express from "express";
import type { Deps } from "../../augment/index.js";
import { bus, readRun, terminalSnapshot } from "./lifecycle/index.js";
import { readNode, validNodeKey } from "./nodes/index.js";
import { EmbeddingUnavailable, listRuns } from "./list/index.js";
import { readFilterOptions } from "./list/filters/index.js";
import { parseListParams } from "./list/params/index.js";

export { abandonRunningRuns, startRun } from "./lifecycle/index.js";
export { backfillInBackground, startupBackfillLimit } from "./embedding/index.js";

/** 같은 이벤트 객체의 직렬화는 한 번만 한다(구독자마다 큰 행을 다시 직렬화하지 않는다). */
const serialized = new WeakMap<object, string>();
const jsonOf = (detail: object): string => {
  let json = serialized.get(detail);
  if (json === undefined) {
    json = JSON.stringify(detail);
    serialized.set(detail, json);
  }
  return json;
};

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
  // 엔진은 이 프로세스 하나가 소유하므로(MCP 호출도 내부 listener 를 거쳐 이 프로세스에서 돈다) 변화는 모두 bus 로 온다: DB 를 주기적으로 읽지 않는다.
  // 같은 이벤트의 직렬화는 구독자들이 공유하고, 느린 소비자는 쓰기 역압(drain)을 기다리며 최신 상태만 남긴다.
  router.get("/runs/:id/events", async (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return void response.status(400).json({ error: "invalid id" });
    // 구독을 먼저 걸고 현재 상태를 읽는다. 그 사이에 바뀐 상태를 놓치지 않기 위해서다(중복 전송은 해롭지 않다).
    const pending: { status: string }[] = [];
    let live = false;
    let lastSent = "";
    let backlog: string | null = null;
    let waitingDrain = false;
    const write = (json: string) => {
      if (waitingDrain) {
        backlog = json;
        return;
      }
      if (!response.write(`data: ${json}\n\n`)) {
        waitingDrain = true;
        response.once("drain", () => {
          waitingDrain = false;
          if (backlog !== null) {
            const latest = backlog;
            backlog = null;
            write(latest);
          }
        });
      }
    };
    const send = (detail: unknown) => {
      const json = jsonOf(detail as object);
      if (json === lastSent) return;
      lastSent = json;
      write(json);
    };
    const onUpdate = (detail: { status: string }) => {
      if (!live) return void pending.push(detail);
      send(detail);
      if (detail.status !== "running") finish();
    };
    const beat = setInterval(() => response.write(": keep-alive\n\n"), 15_000);
    function finish() {
      clearInterval(beat);
      bus.off(String(id), onUpdate);
      response.end();
    }
    bus.on(String(id), onUpdate);
    request.on("close", () => {
      clearInterval(beat);
      bus.off(String(id), onUpdate);
    });

    const first = await readRun(deps.pool, id);
    if (!first) {
      clearInterval(beat);
      bus.off(String(id), onUpdate);
      return void response.status(404).json({ error: "not found" });
    }
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
    // DB 가 아직 running 이어도 이 프로세스가 이미 종료를 확정했다면(종료 기록 실패 등) 메모리의 종료 스냅샷이 우선이다.
    const snapshot = first.status === "running" ? terminalSnapshot(id) : undefined;
    send(snapshot ?? first);
    live = true;
    for (const detail of pending) send(detail);
    // 가장 최근 상태가 끝난 상태면 더 보낼 것이 없다.
    const latestStatus = snapshot ? String(snapshot.status) : (pending.at(-1)?.status ?? first.status);
    if (latestStatus !== "running") finish();
  });

  router.delete("/runs/:id", async (request, response) => {
    const id = Number(request.params.id);
    const { rowCount } = await deps.pool.query("delete from augment_runs where id = $1 and status <> 'running'", [id]);
    if (rowCount === 0 && (await readRun(deps.pool, id))) return void response.status(409).json({ error: "run is still running" });
    response.status(204).end();
  });

  return router;
}
