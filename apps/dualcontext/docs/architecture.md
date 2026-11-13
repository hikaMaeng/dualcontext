# Architecture

Source is partitioned by runtime. Drill down from here.

| Path | Contract | Drill-down |
| --- | --- | --- |
| `src/server` | Express app, env validation, and process lifecycle. Serves the built front assets in production. | `src/server/app.ts#createApp` |
| `src/front` | Vite-built React shell. Not served directly in production; Express serves its build output. | `src/front/main.tsx` |

The app owns wiring and lifecycle only. Domain rules belong in
`packages/dualcontext_domain`, imported by workspace package name.

Build output is a self-contained bundle under `dist/`, which the runtime image
copies. Nothing is resolved from a package manager at runtime.
