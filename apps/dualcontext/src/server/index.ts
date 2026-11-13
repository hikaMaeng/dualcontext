import { createApp } from "./app.js";
import { readEnv } from "./env.js";

const env = readEnv();
const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`dualcontext listening on ${env.port}`);
});

// The container stops by signal. Without this the process ignores SIGTERM and
// the runtime waits out its kill timeout on every restart and deploy.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`dualcontext received ${signal}, closing`);
    server.close(() => process.exit(0));
  });
}
