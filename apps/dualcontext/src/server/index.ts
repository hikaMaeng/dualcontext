import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { adminRouter } from "./admin/index.js";
import { abandonRunningRuns, backfillInBackground, startupBackfillLimit } from "./admin/runs/index.js";
import { createApp } from "./app.js";
import { createHealthPool, createPool, pingDatabase } from "./db/index.js";
import { readEnv, readInternalPort } from "./env.js";
import { createInternalApp, listenInternal } from "./internal/index.js";
import { createMcpServer } from "./mcp/index.js";
import { createRelayRunner } from "./mcp/relay/index.js";
import { createLocalRunner } from "./mcp/tools/augment/run/index.js";
import { createCancelAwareTransport } from "./mcp/transport/index.js";
import { createModelClient } from "./model/index.js";
import { ensurePlanConfig } from "./plan/config/index.js";
import { runRegistry } from "./run/index.js";
import { ensureDefaults } from "./seed/index.js";

// `--stdio` runs the MCP server over stdin/stdout and nothing else. Stdout is
// the protocol channel there, so every log line goes to stderr.
// Without it the process serves HTTP health, which is what the container runs.
const stdio = process.argv.includes("--stdio");

if (stdio) {
  // MCP stdio 프로세스는 엔진 · DB · 모델 클라이언트를 만들지 않는다: 엔진을 소유한 서버 프로세스의 내부 listener 로 중계한다.
  // 그래야 동시성 큐 · 실행 레지스트리 · 취소가 한 프로세스에 모인다. 서버가 없으면 호출이 명확한 오류가 된다(직접 실행으로 폴백하지 않는다).
  const runner = createRelayRunner(`http://127.0.0.1:${readInternalPort()}`);
  const transport = createCancelAwareTransport(new StdioServerTransport());
  await createMcpServer(runner, transport).connect(transport);
  console.error("dualcontext mcp stdio ready");
  // SDK 의 stdio transport 는 stdin EOF 를 onclose 로 알리지 않는다: 진행 중인 요청을 전부 취소하고 닫는다.
  process.stdin.on("end", () => {
    transport.abortAll();
    void transport.close().finally(() => process.exit(0));
  });
} else {
  const env = readEnv();
  const pool = createPool(env.databaseUrl);
  const model = createModelClient(pool, env.llmApiKey);
  const deps = { pool, model, dataDir: env.dataDir };
  await ensureDefaults(pool);
  // 계획 설정 단일 행(기본 classic). 이미 있으면 건드리지 않는다.
  await ensurePlanConfig(pool);

  // 이전 프로세스에서 진행 중이던 실행은 재시작과 함께 사라졌으므로 닫아 둔다(엔진은 이 프로세스 하나가 소유한다).
  const abandoned = await abandonRunningRuns(pool);
  if (abandoned > 0) console.log(`closed ${abandoned} interrupted run(s)`);
  // 옛 실행 로그의 질의 임베딩(의미 검색용)을 뒤에서 채운다. 기다리지 않고, 임베딩 서버가 안 되면 조용히 멈춘다. 당기는 순서는 뒤(background)다.
  backfillInBackground(pool, model.background(), startupBackfillLimit);
  const healthPool = createHealthPool(env.databaseUrl);
  const app = createApp({ checkDatabase: () => pingDatabase(healthPool), admin: adminRouter(deps) });
  const server = app.listen(env.port, () => {
    console.log(`dualcontext listening on ${env.port}`);
  });
  // 내부 전용 listener: MCP stdio 프로세스의 중계 요청을 받는다(loopback, 게시하지 않는다).
  const internal = await listenInternal(createInternalApp(createLocalRunner(deps)), readInternalPort());
  console.log(`dualcontext internal listener on 127.0.0.1:${readInternalPort()}`);

  // The container stops by signal. Without this the process ignores SIGTERM and
  // the runtime waits out its kill timeout on every restart and deploy.
  // 종료 순서: 신규 접수 중지 → 전체 실행 abort(shutdown) → 유한 drain(5초) → 연결 종료 → 큐 소비자 · pool 종료.
  let closing = false;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      if (closing) return;
      closing = true;
      console.log(`dualcontext received ${signal}, closing`);
      server.close();
      internal.close();
      runRegistry.cancelAll("shutdown");
      const deadline = Date.now() + 5000;
      const drain = setInterval(() => {
        if (runRegistry.size() > 0 && Date.now() < deadline) return;
        clearInterval(drain);
        server.closeAllConnections();
        internal.closeAllConnections();
        void model.close().then(() => Promise.all([pool.end(), healthPool.end()])).finally(() => process.exit(0));
      }, 100);
    });
  }
}
