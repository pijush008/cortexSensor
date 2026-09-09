# SHM Platform — Product Architecture Audit & Target Architecture

**Date:** 2026-09-09
**Scope:** Full repository inspection against production SaaS requirements.
**Method:** Every claim below was verified against source or a command run in
this session. Claims taken from existing docs were re-checked; where the docs
and the code disagreed, the code won.

**Verification baseline captured during this audit**

| Check | Result |
|---|---|
| `backend` `tsc --noEmit` | clean (exit 0) |
| `frontend` `tsc --noEmit` | clean |
| Backend tests | 23 tests / 4 files present; **not executed** — Postgres is down |
| Running services | only `python-shm`; `nginx` crash-looping; Postgres/Redis/MQTT ports closed |
| Git | **zero commits** — all files staged on `master`, never committed |

---

## 1. Current architecture

Seven deployable pieces, wired by `docker-compose.yml`:

```
ESP32 firmware ──MQTT──▶ Raspberry Pi gateway ──┬── MQTT (cloud broker) ──┐
                                                └── REST + x-api-key ─────┤
                                                                          ▼
        nginx :80 ──┬── Next.js frontend :3000        Express API :3001 ──┴──▶ PostgreSQL/Timescale
                    ├── Express API   :3001                    │
                    └── FastAPI       :8000                    ├──▶ Redis (rate limit, 30s dash cache)
                                                               └──▶ Mosquitto (ingest + republish)
```

Backend is a modular monolith: `routes → controller → service → prisma`, one
module per domain (`auth`, `users`, `devices`, `sensors`, `projects`,
`dashboard`, `reports`, `exports`, `iot`, `subscription`).

## 2. Current stack

| Layer | Actual |
|---|---|
| Frontend | Next.js 15 App Router, React 19, TS, Tailwind v4, TanStack Query, Zustand, Recharts, axios, mqtt.js |
| Backend | Node 18, Express 4, TypeScript, Prisma 5, Zod 3, JWT, bcryptjs, nodemailer, winston, ioredis, multer |
| Data | PostgreSQL 15 + TimescaleDB image, Redis 7 |
| Messaging | Mosquitto 2.0, auth enforced (`allow_anonymous false`) + ACL file |
| Analytics | FastAPI + numpy — **one** endpoint, `POST /fft` |
| Edge | Arduino/ESP32 sketch, Python Pi gateway, Node simulator |
| CI | GitHub Actions: backend tests w/ Postgres service; frontend `build \|\| true` |

Notable stack gaps vs target: **no shadcn/ui**, **no React Hook Form usage**,
**no job queue/workers**, **no object storage**, **no WebSocket/SSE server**,
**no payment provider**.

## 3. Current frontend structure

`src/app/(auth)` and `src/app/(app)` route groups; `middleware.ts` redirects
unauthenticated users; `RoleGuard` + `ROLE_ROUTE_ACCESS` gate by role
client-side; backend is the enforcement authority.

**Page-by-page data provenance (verified by counting API references):**

| Route | Lines | Data source | Verdict |
|---|---|---|---|
| `/dashboard` | 358 | real API | KEEP |
| `/projects` | 415 | real API | KEEP |
| `/devices`, `/devices/[id]/channels` | 861 | real API | KEEP |
| `/sensors` | 414 | real API | KEEP |
| `/users` | 305 | real API | KEEP |
| `/reports` | 223 | real API | KEEP |
| `/exports`, `/data-download` | 881 | real API | KEEP |
| `/subscription` | 435 | real API | KEEP |
| `/profile` | 138 | real API | KEEP |
| `/login` | 390 | real API | KEEP |
| `/mqtt` | 257 | direct broker from browser | REFACTOR (see SEC-1) |
| **`/alerts`** | **373** | **hardcoded array** | **REPLACE** |
| **`/analytics`** | **458** | **hardcoded array** | **REPLACE** |
| **`/audit`** | **310** | **hardcoded array** | **REPLACE** |
| **`/gateways`** | **475** | **hardcoded array** | **REPLACE** |
| `/` (marketing) | 1217 | static | KEEP (isolate) |
| `/hero-demo` | 10 | demo stub | REMOVE |

**1,616 lines across four pages contain zero API calls.** They render invented
modal frequencies (`3.42 Hz`, damping `2.1%`, `-3.8%` change), invented FFT
peaks, invented audit entries with fabricated actor emails and source IPs, and
invented gateway battery/telemetry.

## 4. Current backend structure

11 route modules mounted at bare `/api` (no versioning). Auth split into
`auth.service` (646 lines) + `refresh-token.service`. `projects.service` is
1,309 lines and is the main complexity hotspot. Cross-cutting helpers:
`utils/audit.ts`, `utils/jwt.ts`, `utils/cookies.ts`, `middleware/tenant.ts`,
`middleware/permissions.ts`, `middleware/apiKey.ts`.

## 5. Current Prisma schema

15 models. **The domain hierarchy required by the product is 8 levels deep;
the schema implements 3 of them.**

```
REQUIRED:  Tenant → Project → Structure → Location → Gateway → Device → Sensor → Measurement
PRESENT:            Project → ──────────────────────────────── Device → Sensor → SensorData
MISSING:   Tenant,           Structure,  Location,  Gateway
```

Absent models (verified): `Tenant`, `Structure`, `Location`, `LocationHistory`,
`Gateway`, `SensorAssignment`, `SensorCalibration`, `Measurement`, `Alert`,
`Inspection`, `Report`, `Permission`, `Role`.

Legacy-MySQL artifacts that survived the migration:

- **String pseudo-foreign-keys.** `Project.deviceId` is `VarChar`,
  `DeviceChannel.deviceId` is `VarChar` — neither is a real FK. Referential
  integrity is unenforceable at the DB level.
- **JSON-in-text relations.** `Device.assignSensor` and `Project.sensorId` hold
  `"[28,29]"`. Every consumer `JSON.parse`s inside a `try/catch`; a malformed
  value silently degrades to an empty list.
- **Booleans as string enums.** `YesNo { true_, false_ }`,
  `ActiveOneZero { one, zero }`, forcing `"false_" as never` casts at ~60 call
  sites and defeating type safety.
- **No tenant column on `sensor_data`.** Tenant scoping requires a join through
  `projects`, so ingestion and every read carry avoidable cost and risk.

## 6. Current authentication

Solid for its scope. HttpOnly cookies (`shm_access` / `shm_refresh`),
`sameSite: strict`, `secure` in production; bcrypt (cost 10); refresh-token
**rotation with family revocation on replay** — genuine theft detection, better
than most codebases at this stage; per-request DB rehydration so a
disabled/deleted user is rejected immediately; OTP reset gated by a short-lived
signed reset token with a `purpose` claim; login limiter 20/15min, OTP 10/15min,
global 500/15min, all Redis-backed with in-memory fallback.

**Missing:** MFA (§24 requires it), account lockout/risk controls, session
listing/revocation UI, `/api/me`. Password-reset and email-verification tokens
are signed with the refresh/access secrets rather than dedicated keys.

## 7. Current authorization

Two layers: a coarse role matrix (`middleware/permissions.ts`) and object-level
checks (`assertProjectAccess`, `ensureDeviceAccess`, `ensureSensorAccess`,
`resolveTenantScope`). Dashboard identity is correctly derived from the session
and body-supplied `userId`/`userType` are ignored.

**Structural limits:**

- **Four roles** (`superadmin`, `admin`, `contractor`, `authority`) against the
  five required (`SUPER_ADMIN`, `ORGANIZATION_ADMIN`, `SHM_ENGINEER`,
  `TECHNICIAN`, `VIEWER`). No `SHM_ENGINEER` or `TECHNICIAN` concept exists.
- **No granular permissions.** §18 requires ~35 named permissions; the code has
  9 coarse buckets. Permissions are hardcoded constants, not data.
- **Tenancy is emulated by `User.parentId`.** There is no `Tenant` row, so there
  is nothing to attach subscriptions, quotas, retention or settings to except an
  admin user. Isolation is enforced by remembering to call the right helper on
  every route — it is convention, not an invariant.

## 8. Current IoT architecture

Two ingest paths converge correctly on one pipeline
(`iot.service.createNetworkDataFromDevice`): REST `POST /api/beamDeviceData`
(API key, constant-time compare) and MQTT subscribe on `shm/ingest/#`. Payloads
are Zod-validated on both paths; the ESP32, Pi and Node simulator all emit the
same contract. Channel readings are index-paired to `device_channel` rows, then
calibrated (`calibrationValue × raw`).

**Critical gaps:**

- **No idempotency.** `SensorData` has no `sequenceNumber`, no event ID and no
  unique constraint. A gateway retry writes a duplicate measurement. §12 and §77
  require duplicate detection; it does not exist.
- **No offline buffering.** `pi_gateway.py` forwards each message inline. There
  is no local persistent spool — only MQTT reconnect retry. If the Pi is offline
  when a message arrives, **the measurement is lost**. §12's store-and-forward
  requirement is unimplemented.
- **No `Gateway` entity.** `gatewayDeviceId` is a bare string on `Device`.
  Gateway health, buffering state and connectivity have nowhere to live — which
  is exactly why `/gateways` is a hardcoded page.
- **Per-CRUD ingestion.** Each channel reading is an individual
  `prisma.sensorData.create()` inside nested loops, with `findUnique` per sensor
  and per sensor-type per reading. This will not sustain accelerometer rates
  (§29).

## 9. Current SHM architecture

**There is effectively none.** Against the §34 pipeline:

| Stage | Status |
|---|---|
| Raw data | ✅ stored |
| Quality check | ❌ no quality flags anywhere |
| Preprocessing / filtering / detrending | ❌ |
| Feature extraction | ❌ |
| FFT | ⚠️ `python_shm_service` has a bare `np.fft.rfft` — no windowing, no detrending, no sampling rate, **not connected to the database or the API** |
| PSD | ❌ |
| Modal analysis | ❌ (the `/analytics` page fabricates it) |
| Environmental compensation | ❌ (`node_data` holds temp/humidity but nothing consumes it) |
| Baseline comparison | ❌ no baseline concept |
| AI/ML | ❌ |
| Physics/FEM | ❌ |
| Anomaly engine | ⚠️ static per-channel trigger/threshold only |
| Damage localization / severity / confidence | ❌ |
| Alert engine | ⚠️ `Notification` = `{sensorDataId, min, max}` — no severity, status, assignee or lifecycle |

Current "alerting" is: last-5-readings all below trigger or all above threshold
→ one email per sensor per day. That is a threshold alarm, not structural
health monitoring.

## 10. Current data flow

```
ESP32 ─▶ Pi (no buffer) ─▶ broker / REST ─▶ Zod ─▶ device lookup ─▶ project lookup
      ─▶ date-range check ─▶ per-channel calibrate ─▶ INSERT sensor_data
      ─▶ republish shm/feed/<device>/<sensor> ─▶ threshold check ─▶ email
```

Read path: browser → axios (`withCredentials`) → Express → Prisma → Postgres,
with a 30 s Redis cache on the dashboard. Live path bypasses the backend
entirely: the browser connects **straight to Mosquitto** over WebSocket.

---

## 11. Problems

### Security

| ID | Sev | Finding |
|---|---|---|
| **SEC-1** | **CRITICAL** | **Broker credentials shipped to every browser and subscribed cross-tenant.** `NEXT_PUBLIC_MQTT_USER`/`NEXT_PUBLIC_MQTT_PASS` are inlined into the client bundle by Next.js, so the `shm-web` password is readable in page source by anyone. The default topic is `shm/feed/#` — a wildcard across **all tenants**. Any user, or any visitor who reads the bundle, can subscribe to every tenant's live sensor stream. This defeats multi-tenant isolation completely and is not fixable with an ACL alone. |
| SEC-2 | HIGH | No MFA, despite §24 and §94 requiring it for Super Admin. |
| SEC-3 | HIGH | Tenant isolation is convention-based (per-route helper calls), not a structural invariant. One forgotten call is a cross-tenant leak; there is no `Tenant` row to scope against. |
| SEC-4 | MEDIUM | `IOT_API_KEY` is a single shared static secret for the whole fleet, default `"change-me"`. No per-device identity, no rotation, no revocation (§58, §27). |
| SEC-5 | MEDIUM | Password-reset and email-verification tokens reuse the access/refresh signing secrets instead of dedicated keys. |
| SEC-6 | LOW | No security headers beyond helmet defaults at the app layer; nginx sets three but no HSTS/CSP; no TLS in the compose topology. |

### Performance

| ID | Sev | Finding |
|---|---|---|
| PERF-1 | HIGH | `channelListByDeviceId` is a severe N+1: a `findUnique` per channel for sensor **and** sensor type, a `device.findFirst` **inside** the per-channel map, then four more queries to compute `lastUpdateBy`/`lastUpdateAt` — for a 16-channel device, ~70 queries for one page. |
| PERF-2 | HIGH | `getProjectList` loads **every** matching project plus all devices into memory, then filters and paginates in JavaScript. Cost grows linearly with tenant size. |
| PERF-3 | HIGH | `users.adminList` runs two `project.count` queries **per user row**, plus a parent lookup per row. |
| PERF-4 | HIGH | Ingestion does per-reading `create` + per-reading sensor/type lookups; no batching, no `createMany`, no prepared bulk path (§29). |
| PERF-5 | MEDIUM | The Timescale init script (`docker-init/init_hypertables.sql`) runs at first DB init — **before** Prisma has created any tables — and adds a shadow `created_at` column separate from Prisma's `createdAt`. Even when it succeeds, the hypertable partitions on a column the application never writes. Hypertables are effectively not in use. |
| PERF-6 | MEDIUM | No pagination on `getNodeData` / `getSensorData` — both return whole tables. |

### UX

| ID | Sev | Finding |
|---|---|---|
| UX-1 | CRITICAL | Four pages present fabricated engineering values as measurements (see §3). For a product that monitors bridges and dams this is the single most damaging defect in the repository. |
| UX-2 | HIGH | Empty result sets throw `NotFoundError` → the UI shows an *error* where it should show an *empty state* (`getProjectList`, `listDevices`, `sensorList`, `adminList` all do this). §62/§86 require distinguishing "no data" from "failure". |
| UX-3 | HIGH | No navigation hierarchy matching the domain — no structure or location concept in the UI at all, so §46/§47 (project → structure → location context) cannot be expressed. |
| UX-4 | MEDIUM | No breadcrumbs, no global search, no command palette, no toasts, no destructive-action confirmations, no timezone handling (§64, §65). |
| UX-5 | LOW | Every page is the same density of card grids; §82 requires role-differentiated interfaces. |

### Missing production functionality

Structures · Locations · Gateways as entities · sensor location history ·
calibration records · data-quality flags · sensor health states · alert
lifecycle · inspections · report generation · payment provider + webhooks ·
MFA · granular permissions · object storage · job queue/workers · WebSocket/SSE ·
API versioning · health/readiness endpoints · request IDs · metrics · tracing ·
backups · notification preferences.

### Repository hygiene

- **Zero git commits.** No history, no bisect, no rollback.
- `backend/dist/` and `frontend/tmp/shm-next-build/` are staged into the index.
- `.playwright-mcp/` holds ~200 stale debugging artifacts.
- Root `SHM_Platform_HLD_README.md` (2,500 lines) describes an aspirational
  system; `ARCHITECTURE_ASSESSMENT.md` tracks the real one. Two sources of truth.

---

## 12. What is genuinely good — preserve it

Not everything needs replacing. These are production-quality and should be kept:

1. **Refresh-token rotation with family revocation.** Correct theft detection.
2. **Parameterized raw SQL in `reports.service`** with a whitelisted
   `to_char` group expression — the right way to do dynamic grouping.
3. **`resolveTenantScope`** in exports — the correct scoping pattern; it should
   become the platform-wide model.
4. **Redis with graceful degradation.** The API keeps serving when Redis dies.
5. **The isolation test suite** (`backend/test/isolation.test.ts`, 485 lines) —
   two tenants, asserts 403/404 across every surface. This is the highest-value
   asset in the repo and the template for all future authz work.
6. **The single-pipeline ingest design** — REST and MQTT converging on one
   function is exactly right.
7. **The no-fake-data discipline in `use-data.ts` and `/dashboard`**, including
   the comments explaining *why* errors must propagate. This principle now needs
   applying to the four remaining pages.

---

## 13. Target architecture

### 13.1 Domain model (the foundational change)

Introduce the full hierarchy with real foreign keys and integer/UUID IDs.
Names become editable labels; IDs become immutable (§15).

```
Tenant ─┬─ Subscription ─ Plan
        ├─ Membership ─ User ─ Role ─ Permission
        └─ Project ─ Structure ─ Location
                                    │
                     Gateway ─ Device ─ Sensor
                                    │
                        SensorAssignment (location history, §16)
                        SensorCalibration (history, §32)
                                    │
                              Measurement (Timescale hypertable)
                                    │
                     Alert · Inspection · Report · AuditLog
```

Key decisions:

- **`Tenant` becomes the isolation root.** Every tenant-owned table carries
  `tenantId`, indexed first in every composite index. Isolation stops being a
  remembered function call and becomes a column.
- **`SensorAssignment`** carries `(sensorId, locationId, validFrom, validTo)`.
  Measurements resolve their location *as of their timestamp*, satisfying §16
  and §79 without rewriting history.
- **`Measurement`** replaces `SensorData`: `tenantId`, `sensorId`, `ts`,
  `value`, `sequenceNumber`, `eventId`, `qualityFlags`, with
  `@@unique([sensorId, sequenceNumber])` for idempotent ingest (§12, §28, §30).
- **Booleans become real booleans**; `YesNo`/`ActiveOneZero` are migrated out.
- Legacy `Device.assignSensor` / `Project.sensorId` JSON strings are migrated
  into relational rows and the columns dropped.

### 13.2 Service boundaries (§74)

Start with four, not a microservice sprawl:

| Service | Responsibility |
|---|---|
| `web` | Next.js — RSC for shells, TanStack Query for live client state |
| `api` | Express — REST `/api/v1`, authz, entitlements, SSE for live views |
| `ingest` | MQTT + REST device ingress → validate → dedupe → batch write |
| `worker` | BullMQ on Redis — FFT/PSD, modal, reports, exports, notifications |
| `shm-engine` | The existing FastAPI service, expanded, called by `worker` |

### 13.3 Security target

- Kill browser→broker access (SEC-1): the browser subscribes to **`api` via
  SSE**, which authenticates the session, resolves tenant, and forwards only
  that tenant's stream. Broker credentials never leave the server.
- Per-device credentials replacing the shared API key; provisioning issues a
  device secret with rotation and revocation, tied to the `Device` lifecycle (§27).
- MFA (TOTP) required for `SUPER_ADMIN`, optional per-tenant policy for others.
- Permissions as data (`Role`, `Permission`, `RolePermission`) with a
  `requirePermission('SENSOR_CALIBRATE')` middleware.
- Every tenant-scoped query goes through a single `tenantScope(user)` helper
  returning a Prisma `where` fragment; lint rule forbids raw `prisma.<model>`
  access to tenant tables outside repositories.

### 13.4 Data-quality and SHM target

Quality flags computed **at ingest** (gap, duplicate, out-of-order, flatline,
saturation, out-of-range, rate mismatch, stale calibration) and stored on the
measurement — never dropped (§30). Sensor health (`ONLINE`/`OFFLINE`/`DEGRADED`/
`NO_DATA`/`ERROR`/`MAINTENANCE`) kept strictly separate from structural
findings, so a dead sensor never becomes a damage alert (§31).

Analysis runs as queued jobs writing versioned `AnalysisResult` rows carrying
input window, method, parameters, model version, baseline version, environmental
context and confidence — so every engineering statement is reproducible and
traceable (§103).

---

## 14. Migration plan

Ten vertical slices. **Every slice ends with the repo building, typechecking and
tests passing.** No slice ships UI for data that does not yet exist.

| # | Slice | Contents | Exit criteria |
|---|---|---|---|
| **0** | **Stabilize** ✅ **DONE** (`d37f660`) | Git baseline; untrack build artifacts; delete `/hero-demo`; fix Timescale init; `/health`+`/ready`; request IDs; **fabricated data removed outright** from the 4 pages (chosen over a build flag — a flag can be flipped) | ✅ tsc clean both apps; 23/23 tests; build 21 routes; probes exercised live |
| **1** | **Tenant + identity** | `Tenant`, `Membership`, `Role`, `Permission`; migrate `parentId`→`Tenant`; 5 roles; granular permissions; `tenantScope()`; MFA for super admin; `/api/v1` | Isolation suite extended and green |
| **2** | **Structure + location** | `Structure`, `Location`, project→structure→location UI, breadcrumbs | Engineer can navigate the real hierarchy |
| **3** | **Gateway + device + sensor** | `Gateway` entity, device lifecycle states, per-device credentials, `SensorAssignment`, `SensorCalibration` | `/gateways` replaced with real data |
| **4** | **Ingest v2** | `Measurement` + hypertable, sequence/event IDs, idempotent batch writes, quality flags, **Pi store-and-forward buffer** | Offline test: disconnect, reconnect, zero loss, zero duplicates |
| **5** | **Live + history** | SSE from `api` (kills SEC-1), downsampled history endpoints, engineering-grade charts | Browser never touches the broker |
| **6** | **SHM analytics** | Worker + queue; FFT/PSD with windowing and detrending; baseline; modal tracking; versioned results | `/analytics` replaced with real, reproducible analysis |
| **7** | **Alerts** | `Alert` lifecycle, severity rules, dedup, assignment, notifications | `/alerts` replaced with real data |
| **8** | **Inspections + reports** | `Inspection`, report generation to S3, audit UI on the real `AuditLog` | `/audit` replaced with real data |
| **9** | **Billing** | Payment provider, webhooks with signature verification, grace periods, entitlement enforcement | Payment state never trusted from the client |

Slices 0–1 are prerequisites for everything else and should not be parallelized.

---

## 15. Disposition of existing code (§101)

| Component | Verdict | Reason |
|---|---|---|
| Auth service + refresh rotation | **KEEP** | Correct, well-tested |
| `reports.service` raw SQL | **KEEP** | Properly parameterized |
| `resolveTenantScope` | **KEEP → generalize** | Right pattern, wrong scope |
| Redis store + cache | **KEEP** | Degrades correctly |
| Isolation/billing tests | **KEEP → extend** | Highest-value asset |
| Ingest pipeline shape | **KEEP → rebuild internals** | Right design, wrong performance and no idempotency |
| Prisma schema | **REFACTOR** | Add hierarchy; migrate string FKs and string booleans |
| `projects.service` (1,309 ln) | **REFACTOR** | Split by concern; fix N+1s |
| `channelListByDeviceId` | **REFACTOR** | Severe N+1 |
| Empty-set `NotFoundError`s | **REFACTOR** | Return empty page, not an error |
| `/alerts`, `/analytics`, `/audit`, `/gateways` | **REPLACE** | Fabricated data; rebuild on real models in slices 6–8 |
| `/mqtt` page | **REPLACE** | Credential exposure; becomes SSE-backed |
| `/hero-demo` | **REMOVE** | Dead stub |
| `backend/dist`, `frontend/tmp` | **REMOVE from git** | Build artifacts |
| Legacy backup tarball | **KEEP** | Migration reference; never delete |
