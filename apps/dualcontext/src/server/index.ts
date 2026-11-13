import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { adminRouter } from "./admin/index.js";
import { createApp } from "./app.js";
import { createPool, pingDatabase } from "./db/index.js";
import { readEnv } from "./env.js";
import { createMcpServer } from "./mcp/index.js";

// `--stdio` runs the MCP server over stdin/stdout and nothing else. Stdout is
// the protocol channel there, so every log line goes to stderr.
// Without it the process serves HTTP health, which is what the container runs.
const stdio = process.argv.includes("--stdio");
const env = readEnv();
const pool = createPool(env.databaseUrl);

if (stdio) {
  const transport = new StdioServerTransport();
  await createMcpServer(pool).connect(transport);
  console.error("dualcontext mcp stdio ready");
  transport.onclose = () => void pool.end().then(() => process.exit(0));
} else {
  const app = createApp({ checkDatabase: () => pingDatabase(pool), admin: adminRouter(pool) });
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
