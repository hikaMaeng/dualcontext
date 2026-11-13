# Constraints

## Blast radius

| Surface | Consumers | Invariants (do not break) |
| --- | --- | --- |
| `GET /health`, `GET /api/health` | deploy verification, container `HEALTHCHECK`, browser smoke tests | Stays unauthenticated, side-effect free, and answers before the front assets load. Changing the path breaks the deploy report and the image health probe together. |
| `readEnv` (`src/server/env.ts`) | process start | Rejects a `PORT` outside `10000-59999` and an unknown `NODE_ENV` by throwing at startup, never by falling back to a default. |
| static asset serving | every browser route | The SPA fallback must not shadow `/health`; route order in `createApp` is load-bearing. |

## Runtime

* Port comes from env only, validated before use. No source file embeds one.
* The process must exit on `SIGTERM`; the container stops by signal.
* Production serving is Express only. The Vite dev server is a development tool
  and is never the deployed surface.

## Front end

UI uses shadcn/ui components, Tailwind CSS, and Radix primitives. Markup is
written for headless-browser verification; see the `headless-browser-test`
skill for the contract shape.

Approved locators, which tests may rely on:

| Locator | Element |
| --- | --- |
| `role=banner` / `nav[aria-label="Primary"]` | header navigation |
| `role=main` | main content landmark |
| `role=heading` level 1, id `page-title` | page title |
| `role=status`, `data-testid="service-state"` | runtime status line |
| `role=link` name `Health` | health endpoint link |

Removing or renaming any of these is a breaking change for the smoke tests.
Prefer adding a new hook over repurposing one.
