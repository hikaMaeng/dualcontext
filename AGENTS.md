# Repository Instructions

This repository is a web-service monorepo: TypeScript, Turbo, and npm
workspaces, with deployable service modules under `apps/` and shared libraries
under `packages/`.

Read this file completely before your first edit. It is short on purpose, and
everything in it is load-bearing.

## What this repository is defending against

Writing the hard code is not where projects here fail. Modification is.

A domain keeps moving and users keep learning the product, so the changes are
many, individually small, and some reach further than they look. Against a
badly divided codebase every one of those edits degrades the structure a
little; the response is to regenerate and hope for a better result, then
regenerate again, until no amount of regenerating helps. That point arrives
before the product ships.

Everything below exists to keep that from happening. It is not style.

## Structure is the primary contract

**Split by folder, at the granularity of rate of change.**

A file boundary is a suggestion. Asked to change something, a model will merge
two files, rewrite a third, and move code between them — the boundary does not
survive contact.

A folder boundary holds. Pointed at a folder, a model edits inside it and does
not casually wander out. The blast radius of a bad regeneration is then one
directory, and you recover by reverting that directory.

So:

* One folder per bounded concern. A family of like units — each tool, each
  hook, each pipeline phase, each route feature — gives every member its own
  `<family>/<member>/` folder. Never one large file holding the family.
* Granularity follows **rate of change, not line count**. Two things that
  change for different reasons are two folders even when both are small.
* Inside a folder, split files by role: the entry (`index.ts`), pure logic,
  config and types, tests.
* A folder crowded with files, or a file that keeps growing, means two change
  rates got merged. Find the seam. Do not cut at an arbitrary line number.

`monorepo-architecture-guard` owns the full rule and its reference material.

## Prose does not bind; checks do

Assume nothing in this file will be obeyed on effort alone. Rules that cost
effort get deferred unless something fails. That is why this repository ships
verifiers, and why you run them rather than trusting a reading of the rules:

```sh
bash .codex/skills/monorepo-architecture-guard/scripts/check-architecture.sh
bash .codex/skills/docker-compose-module-design/scripts/check-compose.sh
bash .codex/skills/package-docs-graph/scripts/check-docs.sh --include-apps
bash .codex/skills/i18n-resource-map/scripts/check-i18n.sh
```

Each prints `check name=... status=ok|warn|violation` lines and a summary.
Report violations verbatim and fix them; do not re-derive a rule a script has
already decided. A run that prints no summary line did not pass — it died.

**When you add a rule, add the check that catches it breaking.** A rule with no
check is a comment.

## Skills

Repository-local skills live under `.codex/skills/`. They are files, not
something that loads itself: open the owner before working in its area.

| Skill | Owns |
| --- | --- |
| `monorepo-architecture-guard` | Folder decomposition, workspace and package boundaries, TypeScript config, env handling, code shape |
| `docker-compose-module-design` | Compose wiring, Dockerfile contract, container ownership, runtime image contract |
| `web-deploy-docker` | Deploy contract and the deploy report shape |
| `headless-browser-test` | Browser verification, locator contracts, scenario and report shape |
| `package-docs-graph` | Package README and `docs/` structure |
| `react-model-render` | Front-end model/render separation, when a view needs state beyond local component state |
| `i18n-resource-map` | User-visible text: language bundles, key naming, per-folder key map. Every view, no exception |

## Deploy is the enforcement point

`npm run deploy <service>` is the only deploy path. It builds locally, refreshes
the stack through Compose, verifies the published port and health, and prints a
report block. Do not substitute a hand-assembled build plus `docker compose up`:
the entrypoint is where the deploy contract is actually enforced.

Treat the server it produces as the test target. A dev server proves nothing
about what was deployed.

## Repository decisions

Settled facts about this repository, not general rules. You cannot derive these,
so do not guess at them.

* Host ports are assigned by the scaffold installer from the port range defined
  in `monorepo-architecture-guard`, skipping live listeners and ports already
  reserved by another scaffold.
* Compose project name is the target folder project name, even when it is one
  character. The root package name may append `-root` only to avoid a workspace
  name collision; do not reuse that package name as the Compose project name.
* Container name is the app service name from `apps/<service>` without a
  repository prefix. Docker Compose rejects one-character explicit
  `container_name` values, so one-character services use `<service>-app`.
* Change dependencies with npm commands and commit `package-lock.json` when
  dependency work is requested. Do not introduce a second package manager.
* Every user-visible string is a resource key. There is no exception for "just
  one label".

## Scope

The scaffold baseline is intentionally small: a health endpoint, one accessible
front shell, a deploy path, docs, and smoke tests. Do not infer or implement a
product workflow, data model, queue, background worker, or other domain feature
unless the user explicitly requests that feature work.

Adding a feature means adding its folder, its docs node, and its resource keys
in the same change. A feature that lands without them is not finished.
