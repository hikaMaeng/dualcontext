# API

## HTTP

| Route | Response | Defined in |
| --- | --- | --- |
| `GET /health` | `{ "status": "ok", "service": "dualcontext" }` | `src/server/app.ts#createApp` |
| `GET /api/health` | same payload as `/health` | `src/server/app.ts#createApp` |
| `GET /*` | built front `index.html` (SPA fallback) | `src/server/app.ts#createApp` |

Static assets from the front build are served before the fallback.

## Module surface

| Export | Contract | Defined in |
| --- | --- | --- |
| `createApp()` | Builds the Express app with routes and static serving attached. Does not listen. | `src/server/app.ts#createApp` |
| `readEnv(source?)` | Validates and returns `{ port, nodeEnv }`. Throws on an out-of-range port or unknown `NODE_ENV`. | `src/server/env.ts#readEnv` |

`createApp` is separated from listening so tests can exercise routes without
binding a port; see `src/server/app.test.ts`.
