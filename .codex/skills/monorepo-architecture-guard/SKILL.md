---
name: monorepo-architecture-guard
description: Enforce the repository monorepo contract: TypeScript latest stable, Turbo plus npm workspaces, exact versions, repository package reuse, package and app boundaries, service-module shape, dist manifest targets, env-schema usage, deploy-script conventions, and React plus shadcn/ui plus Express wiring. Use when creating or reviewing packages, app service modules, package.json, tsconfig, workspace imports, env handling, frontend and backend integration, or monorepo configuration.
---

# Monorepo Architecture Guard

Apply repo-only constraints. Skip generic coding knowledge.

## Stack

* TS latest stable.
* Turbo monorepo. Define task `inputs` and `outputs`. Document remote-cache strategy in root README.
* npm workspaces. Root `package.json` declares `workspaces` for `apps/*` and `packages/*`.
* `package-lock.json`: committed, and installed with `npm ci` in CI and in the deploy path so the tree is reproducible.
* One package manager. Do not add `yarn.lock`, `.yarnrc.yml`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`; a second lockfile means two answers to the same question.
* Workspace dependencies are declared by package name with `"*"`; npm links the local workspace rather than fetching from the registry.
* Reuse checks search source repositories directly; do not depend on a package catalog service.

## Why plain npm

The dependency layout is `node_modules`, resolved by Node's own algorithm. That
is a deliberate choice of compatibility over checkout size.

Alternative layouts that keep packages in archives and resolve them through a
patched loader make a checkout dramatically smaller — a worktree of a few files
instead of thousands. The cost is that every tool in the chain has to
understand that resolution, and the ones written outside Node do not always:
native bundlers reach for the filesystem directly, and when their path handling
disagrees the failure surfaces as a crash inside a package the project never
named, or as a build that stops producing output and never exits.

`node_modules` costs disk and install time and buys a resolution model that
every bundler, test runner, and editor already implements. For a scaffold whose
job is to work on someone else's machine, that trade is the right way round.

## Boundaries

* `packages/`: framework-agnostic libraries only.
* `apps/`: service modules only; no business logic in wiring-only shells outside service modules.
* Apps may depend on packages; packages must never depend on apps.
* Never import from `apps/` into `packages/`.
* Cross-package imports: workspace names only; never relative cross-package paths.
* App modules own orchestration, framework lifecycle, HTTP/static serving, composition, and process wiring.
* Domain rules, invariants, cross-request state interpretation, and framework-independent product logic belong in the paired domain package.
* Do not hide app domain logic in generic shared packages.

## Code Shape

* Keep code direct; do not create functions, classes, modules, or files whose abstraction is effectively just their name.
* Prefer one clear exported or top-level function over a chain of private helpers when the helpers are used only once.
* Allow first-level decomposition by default; nested private-helper decomposition requires concrete duplication, a second caller, or a real boundary such as parsing, validation, persistence, network IO, or a nontrivial algorithm.
* Do not create private helpers for one expression, one method call, one regular expression, one `trim`/`toLowerCase`, or one filename sanitization line.
* Repeated one-line expressions still stay inline unless naming captures a domain invariant or prevents a real bug.
* File-local helpers that are not exported and called once are violations unless they isolate a meaningful boundary.
* Avoid classes unless identity, mutable lifecycle, polymorphism, or resource ownership is required.

## Service Module

* One service = one app module.
* Default shape: `apps/<service>/src/server` + `apps/<service>/src/front`.
* Each `apps/<service>` must pair with exactly one domain package at `packages/<service>_domain`.
* Do not create additional domain-related packages for the same app.
* `src/front`: Vite-built.
* Prod serving: only `src/server` Express serves built front assets.
* Final deployment/container target: server runtime artifact.
* FE remains independently buildable.

## Package Rules

* Domain package shape: `packages/<service>_domain/src/common`, `src/server`, and `src/front`.
* `src/common`: runtime-neutral domain code shared by server and front.
* `src/server`: server-only domain code; must not import from `src/front`.
* `src/front`: front-only domain code; must not own app UI composition.
* Non-domain packages should be cohesive and standalone; avoid dependencies on other packages unless the abstraction is durable and not app-specific.
* No phantom dependencies; declare every used dep.
* Versions: exact only.
* In `packages/`, framework deps such as `react`, `tailwindcss`, `@radix-ui/*`, `class-variance-authority`, `clsx`, and `tailwind-merge` belong in `peerDependencies`.
* `main` / `module` / `types` -> `dist/`.
* `tsconfig` path names == workspace package names.
* Node runtime resolution must work without tsconfig-only aliasing.
* Prefer a standard `npm run deploy` script that wraps local build plus compose refresh.

## Runtime

* FE stack assumption: React + shadcn/ui + Tailwind CSS + Radix UI primitives; verify major compatibility on bumps.
* Frontend implementation must use shadcn/ui components by default for UI primitives and composed controls. Do not introduce another UI component framework unless the user explicitly overrides this project contract.
* Dev: explicit Vite proxy to BE on separate ports.
* Prod: BE serves built FE static assets.
* BE: Express only.
* Port source: env only; range `10000-59999`. A Dockerfile may declare the image's default `PORT`, and compose may publish it; no source file embeds a port literal.
* Read env only after explicit schema validation.

## Concern Decomposition

This is the rule that decides whether the codebase survives being edited by a
model, so it is worth stating why rather than only what.

### What actually goes wrong

Writing hard code is not the failure mode. Models are good at that. The failure
mode is **modification** — and most modification is not bug-fixing. A domain
keeps moving, and users learn the product and want it to behave differently.
The changes are many, individually small, and some of them reach much further
than they look.

Against a badly divided codebase each of those edits degrades the structure a
little. The response is to regenerate and hope for a better result, then
regenerate again, until no amount of regenerating helps and the code is beyond
recovery. That point is usually reached *before* the thing ships, which is why
the conclusion people draw is that a model cannot build a real product. The
conclusion is wrong; the structure was.

### Why folders, not files

A file boundary is a suggestion. Asked to change something, a model will
happily merge two files, rewrite a third, and move code across them — the
boundary does not survive contact.

A folder boundary holds. Pointed at a folder, a model edits inside it and does
not casually wander out. So the blast radius of a regeneration is the folder,
not the codebase, and a bad result is discarded by reverting one directory.

That is the whole mechanism: **containment**. Split by folder until each folder
matches one rate of change, and every regeneration is bounded by construction
rather than by the model's restraint.

Splitting the files *inside* a folder by responsibility compounds the effect,
because it narrows what any single edit has to touch. But the folder is what
provides the guarantee; files alone do not.

### The rule

* One folder per bounded concern, not one god-file. When a domain has a family
  of like units (each tool, each hook, each pipeline phase, each route feature),
  give each member its own `<family>/<member>/` folder rather than one large file.
* Granularity follows **rate of change**, not line count. Two things that change
  for different reasons belong in different folders even when both are small.
* Inside a folder, split by role: the unit entry (`index.ts`), its pure logic
  (reducers/validators/parsers), its config/types, and its tests — each a file.
* Front feature state follows the same rule; see the `react-model-render` skill
  and its `references/model-decomposition.md` for the per-slice model taxonomy.
* Decompose to isolate a real unit/phase/slice boundary, not to inflate file
  count. The Code Shape rules above still bind: no one-line rename helpers.

Shapes this produces at scale: `<domain>/<family>/base/<member>/` for a family
of like units, `<domain>/<pipeline>/<phase>/` for ordered phases, and
`server/web/<client>/<feature>/` for per-feature route state.

As a calibration point, a codebase decomposed this way runs around two files
per folder. If folders routinely hold ten, the split is tracking size rather
than change rate and the containment is not there.

## Output

Return violated rules, affected files, required fixes, residual risk.

## Load

Run the mechanical checks first; they cover the greppable subset (workspaces,
lockfile, competing package managers, `packages/*`->`apps/*` reverse imports, `apps/<svc>` <->
`packages/<svc>_domain` pairing, exact versions):

```sh
bash .codex/skills/monorepo-architecture-guard/scripts/check-architecture.sh
```

The script locates the repository root from its own position, so it is correct
from any working directory and wherever this skill was copied. Pass a path as
the first argument to check a different repository.

Foreign-runtime apps (no `package.json`, e.g. a Python app) are auto-exempted
from the domain-package pairing rule; add extra manual exemptions with
`ARCH_RUNTIME_ONLY_APPS="app1 app2"` if needed.

Report the emitted `check ... status=violation detail=...` lines verbatim and act
on them; do not re-derive or second-guess a rule the script already decided. Then
read `references/checklist.md` for the judgment rules the script cannot decide.
