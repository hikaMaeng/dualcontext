import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { adminRouter } from "./admin/index.js";
import { abandonRunningRuns, backfillInBackground, startupBackfillLimit } from "./admin/runs/index.js";
import { createApp } from "./app.js";
import { createPool, pingDatabase } from "./db/index.js";
import { readEnv } from "./env.js";
import { createMcpServer } from "./mcp/index.js";
import { createModelClient } from "./model/index.js";
import { ensureDefaults } from "./seed/index.js";

// `--stdio` runs the MCP server over stdin/stdout and nothing else. Stdout is
// the protocol channel there, so every log line goes to stderr.
// Without it the process serves HTTP health, which is what the container runs.
const stdio = process.argv.includes("--stdio");
const env = readEnv();
const pool = createPool(env.databaseUrl);
const deps = { pool, model: createModelClient(pool, env.llmApiKey), dataDir: env.dataDir };
await ensureDefaults(pool);

if (stdio) {
  const transport = new StdioServerTransport();
  await createMcpServer(deps).connect(transport);
  console.error("dualcontext mcp stdio ready");
  transport.onclose = () => void pool.end().then(() => process.exit(0));
} else {
  // 이전 프로세스에서 진행 중이던 시험 실행은 재시작과 함께 사라졌으므로 닫아 둔다.
  const abandoned = await abandonRunningRuns(pool);
  if (abandoned > 0) console.log(`closed ${abandoned} interrupted run(s)`);
  // 옛 실행 로그의 질의 임베딩(의미 검색용)을 뒤에서 채운다. 기다리지 않고, 임베딩 서버가 안 되면 조용히 멈춘다.
  backfillInBackground(pool, deps.model, startupBackfillLimit);
  const app = createApp({ checkDatabase: () => pingDatabase(pool), admin: adminRouter(deps) });
  const server = app.listen(env.port, () => {
    console.log(`dualcontext listening on ${env.port}`);
  });

  // The container stops by signal. Without this the process ignores SIGTERM and
  // the runtime waits out its kill timeout on every restart and deploy.
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      console.log(`dualcontext received ${signal}, closing`);
      server.close(() => void pool.end().then(() => process.exit(0)));
    });
  }
}
