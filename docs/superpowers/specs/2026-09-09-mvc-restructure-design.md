# MVC Restructure — Design

**Date:** 2026-09-09
**Status:** Approved for planning
**Scope:** `backend/`, `frontend/`, `python_shm_service/`, `gateway-pi/`

## Goal

Reorganise every service in the repository into a classic layered MVC directory
structure, so that a reader who knows MVC can find any piece of code by asking
"which layer is this?" rather than "which feature owns this?".

This is a structural change. With one deliberate exception (§4), it must not
change runtime behaviour: the same routes serve the same responses.

## Decisions taken

Four decisions were settled before this document was written. They are recorded
here because each one closes off alternatives that a reader might otherwise
reopen.

| Decision | Choice | Consequence |
|---|---|---|
| Scope | Every service in the repo | Frontend and Python services are included despite the caveats in §5 and §6 |
| Backend layout | Classic layered (`controllers/`, `models/`, `views/`, …) | Top-level split is by layer, not by feature; one feature's code spans ~4 directories |
| `models/` depth | Fix layering violations only | ~390 service-level Prisma calls stay put; only the ~8 files that break layering are extracted |
| Imports | Adopt the `@/` alias | Requires `tsc-alias` in the build, or the production server will not boot |

The chosen backend layout has a real cost that was accepted knowingly: editing
one feature means opening four directories, where today it means opening one.
The benefit is a layout that is instantly recognisable to anyone who has worked
in a conventional MVC codebase.

## 1. Starting state

The backend is not unstructured today — it is feature-sliced. 106 TypeScript
files sit under `src/modules/<feature>/`, each holding some combination of
`.routes.ts`, `.controller.ts`, `.service.ts` and `.types.ts`. That is already
MVC-shaped *within* each module; what this change does is invert the grouping
from feature-first to layer-first.

Three facts about the starting state drive the plan:

- **Layering is applied inconsistently.** 14 controller files exist, but 11
  route files still handle requests inline, and Prisma is called from
  controllers, routes and middleware as well as services.
- **No file uses the `@/` alias.** It is declared in `backend/tsconfig.json` and
  referenced 0 times; all 368 source imports and 57 test imports are relative.
- **`tsc --noEmit` exits 0.** This is the verification gate the restructure must
  preserve at every step.

## 2. Target backend layout

```
backend/src/
├── config/          unchanged — index, prisma, redis, redisStore
├── routes/          24 routers + index.ts aggregator
├── controllers/     25 — the 14 that exist, plus 11 new (§4)
├── services/        business logic
├── models/          data-access wrappers (§3)
├── views/           CSV and email serialisers (§3)
├── middleware/      unchanged — 7 files
├── jobs/            background workers with no request cycle
├── lib/             pure domain rules and external adapters
├── utils/           unchanged — infra helpers
├── types/           feature types (`<feature>.types.ts`) + existing index.ts
├── app.ts
└── server.ts
```

`jobs/` and `lib/` exist because classic MVC has no home for code that never
touches a request. Forcing `analysis.queue.ts` into a controller would be
dishonest about what it does. Specifically:

- `jobs/` — `analysis.queue.ts`, `mqtt-ingest.ts`
- `lib/` — `event-bus.ts`, `severity.ts`, `quality.ts`, `permission.catalog.ts`,
  `provider.ts` (billing adapter)

`tenant.provisioning.ts` writes to the database and therefore becomes
`services/tenant-provisioning.service.ts`, not a `lib/` module.

### File moves requiring a rename

Most files move mechanically (`modules/x/x.service.ts` → `services/x.service.ts`).
These need renaming because flattening would otherwise collide or mislead:

| From | To |
|---|---|
| `modules/devices/deviceTypes.routes.ts` | `routes/device-types.routes.ts` |
| `modules/sensors/sensorTypes.routes.ts` | `routes/sensor-types.routes.ts` |
| `modules/sensors/assign.routes.ts` | `routes/sensor-assignments.routes.ts` |
| `modules/measurements/history.service.ts` | `services/measurement-history.service.ts` |
| `modules/measurements/ingest.service.ts` | `services/measurement-ingest.service.ts` |
| `modules/rbac/me.routes.ts` | `routes/me.routes.ts` |

The empty module directories `channels/`, `emails/` and `notifications/` are
deleted; they contain no files.

## 3. The two layers that do not exist yet

### `models/`

Per the "fix violations only" decision, `models/` is a data-access layer
introduced *only* where the current code breaks MVC layering — that is, where
something other than a service talks to Prisma directly:

- `modules/gateways/gateways.controller.ts`
- `modules/projects/projects.controller.ts`
- `modules/billing/billing.routes.ts`
- `modules/health/health.routes.ts`
- `modules/rbac/me.routes.ts`
- `middleware/auth.ts`
- `middleware/tenant.ts`
- `app.ts`

Each gets the queries it needs extracted into `models/<entity>.model.ts`.
Services keep calling Prisma directly. This is a deliberate inconsistency: the
alternative was rewriting ~390 call sites across 38 files in one pass, which
carries a far higher chance of a silent behaviour change — tenant-isolation
queries especially.

`models/` is therefore *incomplete by design*. It should be described that way
in code comments so a future reader does not mistake it for an abandoned
migration.

### `views/`

The backend serves JSON and has no template engine, but it does contain
presentation logic in the wrong place:

- `exports.service.ts` builds CSV strings inline (rows, headers, joins) at
  lines ~147-235. These become `views/exports/*.view.ts`.
- `utils/email.ts` accepts a prebuilt `html` string from its callers, so the
  HTML construction lives in whichever service called it. Those builders move to
  `views/emails/`.

The rule the split encodes: a service decides *what* data; a view decides *how
it is rendered*.

## 4. New controllers — the only behavioural change

11 route files handle requests inline and need their handlers extracted, 38
handlers in total. The counts below come from a grep for inline handler
signatures, except `health` and `stream`, which were counted by reading the
files — so treat those two as approximate until implementation confirms them:

| Route file | Handlers | New controller |
|---|---|---|
| `alerts.routes.ts` | 10 | `alerts.controller.ts` |
| `reports-v2.routes.ts` | 8 | `reports-v2.controller.ts` |
| `analysis.routes.ts` | 5 | `analysis.controller.ts` |
| `billing.routes.ts` | 3 | `billing.controller.ts` |
| `platform.routes.ts` | 3 | `platform.controller.ts` |
| `measurements.routes.ts` | 2 | `measurements.controller.ts` |
| `assign.routes.ts` | 2 | `sensor-assignments.controller.ts` |
| `health.routes.ts` | 2 | `health.controller.ts` |
| `me.routes.ts` | 1 | `me.controller.ts` |
| `deviceTypes.routes.ts` | 1 | `device-types.controller.ts` |
| `stream.routes.ts` | 1 (SSE) | `stream.controller.ts` |

**This is the highest-risk part of the work.** Every other phase moves files;
this one moves logic across a function boundary. Two handlers deserve specific
care:

- `stream.routes.ts` holds a Server-Sent Events handler that owns a
  subscription, a `drain` listener and a keepalive interval. Extracting it must
  preserve the cleanup path, or the server leaks intervals per disconnected
  client.
- `health.routes.ts` deliberately separates liveness from readiness, and
  excludes Redis from the readiness verdict. That logic is documented in a
  comment block which must move with the code, because the reasoning is not
  recoverable from the implementation.

## 5. Frontend

Next.js App Router owns routing through the filesystem, so `src/app/` cannot
move — relocating it changes or breaks every URL. Everything else is renamed:

| From | To | Alias change |
|---|---|---|
| `components/` | `views/` | `@/components` → `@/views` (178 imports) |
| `hooks/` + `lib/api.ts` | `controllers/` | `@/hooks` → `@/controllers` (27) |
| `stores/` + `types/` + `lib/rbac.ts` | `models/` | `@/stores` → `@/models` (16), `@/types` → `@/models/types` (25) |
| `lib/utils.ts`, `lib/errors.ts` | unchanged | — |

The frontend already uses `@/` for 294 of its 303 imports and Next.js resolves
the alias natively, so no build change is needed here — unlike the backend.

**Accepted caveat:** this fights Next.js convention. Contributors and
scaffolding tools expect `components/`. The reason to do it anyway is
consistency with the backend, which was judged to be worth more than convention
compliance.

## 6. Python services

```
python_shm_service/                     gateway-pi/
├── main.py         entry               ├── main.py       (was pi_gateway.py)
├── controllers/    handlers ex-main    ├── controllers/  MQTT handlers
├── services/       spectral.py         ├── services/     spool.py
└── models/         pydantic schemas    └── models/        payload schemas
```

`python_shm_service` benefits genuinely: `main.py` (83 lines) currently mixes
FastAPI routing with orchestration, and `shm/spectral.py` (336 lines) is already
a service in all but name.

`gateway-pi` is two files and gains almost nothing but naming consistency. It is
included because the scope decision was "every service"; if the directories feel
like overhead once built, dropping this phase costs nothing else.

`firmware/` is excluded. It is Arduino C++ for an ESP32 and MVC has no meaning
there.

## 7. Import strategy

The `@/` alias is adopted across the backend. Because `tsc` does **not** rewrite
path aliases into emitted JavaScript, and production runs `node dist/server.js`,
this requires:

1. `tsc-alias` added as a dev dependency, with `build` becoming
   `tsc && tsc-alias`.
2. An alias block added to `vitest.config.ts` — the test runner currently has no
   alias resolution at all, so tests would fail to resolve `@/` imports.

This is a real risk worth stating plainly: if `tsc-alias` is ever dropped from
the build, the server will not boot, and the failure appears at container start
rather than at compile time. Phase 1 exists specifically to prove this works
before any file depends on it.

## 8. Sequencing

Six phases. Each ends green and is committed separately so any single phase can
be reverted without unpicking the others.

| # | Phase | Gate |
|---|---|---|
| 0 | Capture baseline: `tsc --noEmit`, full test run | Recorded green baseline |
| 1 | Add `tsc-alias` + vitest alias; convert imports to `@/` — **no files move** | `tsc` 0 errors; tests pass; `dist/` boots |
| 2 | Backend directory move + import rewrite | `tsc` 0 errors; tests pass |
| 3 | Extract `models/` from the 8 violations | Tests pass |
| 4 | Extract `views/` (CSV + email serialisers) | Tests pass |
| 5 | Extract 11 controllers (§4) | Tests pass |
| 6 | Frontend rename; Python services | `next build` clean |

Phase 1 deliberately changes imports *before* moving files, so that an alias
failure is diagnosed in isolation rather than tangled up with 400 moved files.

Phase 5 is sequenced last among the backend phases because it is the only one
that changes behaviour; by then the structure is stable and the test suite has
already been exercised against the new layout three times.

## 9. Verification

- `npx tsc --noEmit` exits 0 — the primary gate, run after every phase.
- All 15 backend test suites pass against a Postgres brought up with
  `docker compose`. The suites share one database and run with
  `fileParallelism: false`, so they must be run as a whole, not individually.
- `node dist/server.js` boots — required because the alias decision makes a
  compile-time-clean build capable of failing at runtime.
- `next build` completes without error.
- Route inventory before and after: the set of registered paths and methods must
  be identical. This is the check that actually proves §4 preserved behaviour;
  type checking cannot catch a handler wired to the wrong path.

## 10. Out of scope

- Rewriting the ~390 service-level Prisma calls into `models/`.
- Moving `frontend/src/app/` or changing any URL.
- `firmware/`.
- Any change to the Prisma schema, migrations or database.
- Unrelated refactoring encountered along the way. Findings get noted, not
  fixed, unless they block the restructure.
