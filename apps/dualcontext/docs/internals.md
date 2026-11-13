# Internals

The scaffold intentionally contains no product workflow or domain model. What
follows is the small set of decisions that are not obvious from the code.

## Decisions

* **Health is served at two paths.** `/health` is what the deploy and the image
  probe use; `/api/health` exists so a future API surface keeps health under the
  same prefix as everything else. Why: moving it later would break the deploy
  report and the container `HEALTHCHECK` at the same time.
* **`readEnv` throws instead of defaulting.** A service that silently starts on
  the wrong port is harder to diagnose than one that refuses to start. Why: the
  port is also a compose contract, so a mismatch is a deployment defect, not a
  runtime preference.
* **The listener is closed on `SIGTERM`.** Without it the process ignores the
  signal and the container runtime waits out its kill timeout on every stop,
  restart, and deploy. See `src/server/index.ts`.
* **The SPA fallback is registered last.** It matches every path, so any route
  declared after it becomes unreachable.
* **`dist` is a single bundled file, not a dependency tree.** That is why the
  runtime image needs no package manager and why its Node major is independent
  of the version the build ran on.
