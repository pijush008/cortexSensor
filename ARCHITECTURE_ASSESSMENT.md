# SHM Platform — Architecture Assessment

Date: 2026-09-08
Scope: Full inspect-first assessment of backend, frontend, gateway, firmware, python SHM service, docker-compose, nginx, and data model.

---

## 1. Current Architecture (as implemented)

```
                    ┌────────────────────────────────────────────────┐
                    │              NGINX (port 80)                  │
                    │   /  → frontend:3000   (Next.js, WS)          │
                    │   /api/ → backend:3001 (Express, WS)          │
                    │   /shm/ → python-shm:8000 (FastAPI)           │
                    └────────────────────────────────────────────────┘
                                     │
        ┌──────────────┬─────────────┼───────────────┬──────────────┐
        │              │             │               │              │
   ┌────▼───┐    ┌─────▼────┐  ┌─────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
   │ Frontend│   │ Backend  │  │ python-shm │  │ Mosquitto  │  │  Redis 7   │
   │ Node 18 │   │ Node 18  │  │ FastAPI    │  │ broker     │  │ :6379      │
   │ :3000   │   │ :3001    │  │ :8000      │  │ 1883/9001  │  │  (UNUSED)  │
   │ Next 15 │   │ Express  │  │ /fft only  │  │ anon access│  │            │
   └─────────┘   │ +Prisma  │  └────────────┘  └────────────┘  └────────────┘
                 └────┬─────┘
                      │
                 ┌────▼─────┐
                 │Timescale │  sensor_data, node_data hypertables
                 │Postgres15│  plus relational tables
                 └──────────┘

   Edge: ESP32 (firmware/) → esp32/<gw>/data → Pi gateway (gateway-pi/)
         → cloud MQTT shm/device/data  +  REST POST /api/beamDeviceData
         → backend mqtt-ingest → iot.service pipeline → Postgres
         → republish calibrated readings to shm/sensor/<dev>/<sensor>
   Dev sim: gateway/ (Node sample) publishes synthetic telemetry to same topics.
```

## 2. Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15.5 (App Router), React 19, TypeScript, Tailwind v4, Zustand, TanStack Query, Recharts, Luxon-less (date-fns unused), axios |
| Backend | Node 18, Express 4, TypeScript, Prisma 5, PostgreSQL/TimescaleDB, `jose`+`jsonwebtoken`, `mqtt`, `nodemailer`, `winston`, `express-rate-limit`, `helmet`, `zod` |
| DB | PostgreSQL 15 + TimescaleDB (hypertables on `sensor_data`, `node_data`) |
| Broker | Mosquitto 2 (TCP 1883 + WS 9001, anonymous) |
| Cache | Redis 7 — rate-limit store + dashboard cache (P3) |
| Edge | ESP32 Arduino `.ino` (strain/battery/temp/humidity), Pi gateway (Python paho-mqtt), Node sample gateway (simulator) |
| ML / analysis | FastAPI service (`/fft` only; scipy present but unused) |
| Edge proxy | Nginx (80) with WS upgrade map, 25MB body limit, security headers |

## 3. Data Model Highlights

- **User** (id, userType: `superadmin|admin|contractor|authority`, parentId=tenant link, emailId unique, status, isDelete).
- **Tenant model**: hierarchical. `admin.parentId = superadmin.id` (default 0); `contractor/authority.parentId = admin.id`. `organizationId` = `parentId` derived in auth middleware.
- **Project** (createdBy=admin owner, contractorId, authorityId; `deviceId`/`sensorId` stored as **strings** — not real FKs; `projectDevice` JSON snapshot; status enum `not_start|start|pause|end`).
- **Device** (addedBy, assignedAdmin, deviceId string, gatewayDeviceId; `assignSensor` JSON array-of-sensor-ids as **string**).
- **DeviceChannel** (deviceId is a **string** reference; assignSensor string; triggerValue/thresholdValue).
- **Sensor** (assignedAdmin, sensorTypeID FK, calibrationValue).
- **SensorData** (projectId?, deviceId string, sensorId string, sensorData float, createdAt) — Timescale hypertable.
- **NodeData** (battery/temp/humidity/pressure + identity strings) — Timescale hypertable.
- **RefreshToken** (tokenHash, familyId, rotation), **AuditLog** (userId, action, entity, old/new Json) — table exists but **audit writes are not implemented in services**.
- **Notification, ProjectEmail, FirebaseToken, TempOtp** tables present.

## 4. Auth & Roles

- Login → access token (15m) + refresh token (7d, rotation w/ family + revocation) in **httpOnly cookies** (`shm_access`, `shm_refresh`), Secure in prod.
- `authenticate` middleware: JWT carries only `userId`; role/status/permissions reloaded per request. Good design (fast revocation, no stale roles).
- `requireRole`, `superAdminOnly`, `adminOnly`, `requirePermission(permission)` matrix in `permissions.ts`. Matrix is role-only — **no object-level (tenant) scoping in permissions middleware**.
- Object-level checks live ad-hoc in services/controllers:
  - `projects.service.assertProjectAccess` (createdBy/contractorId/authorityId) — exists but **not applied to all routes**.
  - `middleware/tenant` `ensureDeviceAccess` / `ensureSensorAccess` — applied **only** to `PATCH /device/:deviceId` and `PATCH /sensor/:sensorId`.
- IOT ingress auth: shared `x-api-key` constant-time compare; **default `"change-me"` is risky**.

## 5. Key Findings — Security / Correctness Gaps (priority-ordered)

### CRITICAL
1. **Broken-object-level authorization (IDOR) on multiple project/device routes** — any `admin` (or even `contractor`/`authority` where middleware is only `authenticate`) can read/modify other tenants' projects/devices/sensors via direct ID:
   - `PUT /api/project` (updateProject) — no `assertProjectAccess`.
   - `PATCH /api/project/:projectId` (updateProjectDetail) — no check.
   - `PUT /api/project/:projectId/:offset` — `authenticate` only (any role).
   - `PUT /api/projectSetup/:projectId` — `MANAGE_PROJECTS` only, no tenant check.
   - `PATCH /api/project/:projectId/:offset`? (verify) and `/api/channelList/:deviceId`, `/channelList`, `/channelSwap`, `/removeSensorFromChannel/:id`, `/emailSetting`, `/getEmailSetting/:uniqueId`, `/project_analysis` — rely on `authenticate` only, no device/project scope check.
   - `GET /api/iot/beamNodeData` and `GET /api/iot/beamGetSensorData` return **all** node/sensor data for any authenticated user (unscoped). — ✅ Fixed in P1.7 (session-scoped to owned devices).
   - Raw telemetry CSV downloads (`POST /api/download/sensorData`,`nodeData`) accepted any `projectId`/`deviceId` from the body → cross-tenant data exfiltration. — ✅ Fixed in P1.10 (`resolveTenantScope`: superadmin unlimited; others constrained to own projects' devices; foreign anchors → 403).
2. **Frontend has no route-level authorization** — no `middleware.ts`; role gating is presentational (sidebar + inline `userType ===`). A `contractor`/`authority` can navigate directly to `/users`, `/audit`, `/subscription`, `/exports`, `/devices`, `/sensors`, `/analytics`. Backend must be sole authority — which it partially is, but see #1. — ✅ Partially fixed in P1.10 (server-side unauthenticated redirect via `src/middleware.ts`; role-gated navigation remains client-side but is enforced by the backend).
3. **`iot.service.thresholdTriggeredAlert` sends email with `to: ""` and only `bcc`** — nodemailer rejects empty `to`; alerts effectively never delivered (aside from DB notification row). Also dedup logic queries `sensorDataId: { not: 0 }` (matches any) — throttle is effectively global per-day (once/day) not per-channel.
4. **`publishMqtt` opens a new MQTT connection per sensor reading** — inefficient; under load floods the broker with connect/disconnect. Should reuse a long-lived client.
5. **API key default `"change-me"` + mosquitto `allow_anonymous true`** — in any environment where env not set, ingest auth is known/absent.

### HIGH
6. **No audit logging implementation** — `AuditLog` table + schema exists, but no writes happen for create/update/delete of users/projects/devices/sensors. Audit page is mock/hardcoded.
7. **Redis wired but dead** — compose + env only; no client library installed (`ioredis`/`redis` not in any package.json), no code uses it. Either integrate (rate-limit/session/cache) or remove the container. — ✅ Fixed in P3 (Redis-backed rate-limit store + dashboard cache).
8. **Subscription/billing is mock** — superadmin-free/admin-paid UI exists, but no billing backend, no plan enforcement, invoices/payment methods hardcoded. — ✅ Fixed in P2 (billing backend: plans seeded, per-admin subscription + invoices, plan enforcement on project/member creation, tenant-scoped invoice CSV download; UI wired to real data). Payment processing (card capture) remains a future integration — see §Phase 2 notes.
9. **Input validation incomplete** — zod used in auth/iot; projects/devices/sensors/reports/exports controllers mostly rely on inline `request.body` without schema validation.
10. **`isDelete`/`status`/`isUserVerified` enums are strings** (`true_`/`false_`, `"one"`) — error-prone; logic scattered. `status` on Device default `inactive`, gating is inconsistent (some places check `status: one`).

### MEDIUM
11. **Frontend dead code / hardcoded data**: dashboard/gateways/alerts/analytics/audit/subscription use hardcoded demo data on API failure; `date-fns`, `react-hook-form`, `zod`, `@hookform/resolvers` installed but unused; `useNodeData()` unused; no `error.tsx`/`not-found.tsx`; response unwrapping inconsistent.
12. **`NEXT_PUBLIC_API_URL` hardcoded fallback `http://localhost:3001/api`** — will silently break/point at localhost in production if env missing; also not documented in `.env.example`.
13. **MQTT republish topics contain raw device/sensor IDs; broker anonymous** — anyone on the network can subscribe to all real-time data (also no authz on WS topics for the frontend MQTT feed).
14. **`sensorDataFromDevice` (`POST /api/sensorDataFromDevice`) uses `authenticate` (user) not `requiredApiKey`** — this is a device-ingest endpoint protected by a user JWT; firmware/gateway can't use it; the devices page may be calling it with user token. Needs alignment. — ✅ Fixed in P1.8 (now `requireApiKey`, matching `beamDeviceData`).
15. **No pagination enforcement on node/sensor data reads** (`getNodeData` returns everything).

### LOW
16. `projects` uses string-typed `deviceId`/`sensorId`/`projectDevice` JSON; no real FKs → integrity not enforced at DB level; `assertProjectAccess` can't rely on FK cascade.
17. `handleSensorData` channel matching: `channels.find((ch) => ch.assignSensor)` picks the **first** channel with an assigned sensor, not the one matching the channel index of the reading → wrong sensor calibration mapping when multiple channels exist. — ✅ Fixed in P1.9 (index-paired channel matching).
18. No `loading.tsx`/`error.tsx`/`not-found.tsx`; inconsistent loading UX.
19. `.env` files contain real/generated secrets; must be env-managed (never committed).
20. Nginx `/shm/` prefix stripping is exact-match; fragile if FastAPI gains its own prefix.

## 6. Frontend Route Map (auth-gated client-side only)

| Route | File | Role gating (UI only) |
|---|---|---|
| `/dashboard` | `(app)/dashboard` | superadmin/admin/contractor/authority |
| `/analytics` | `(app)/analytics` | all (mock data) |
| `/alerts` | `(app)/alerts` | all (mock data) |
| `/gateways` | `(app)/gateways` | all (mock data) |
| `/devices`, `/devices/[id]/channels` | `(app)/devices` | devices add/edit/delete superadmin-only |
| `/sensors` | `(app)/sensors` | add/edit/delete superadmin-only |
| `/mqtt` | `(app)/mqtt` | all (live feed) |
| `/projects`, `/reports`, `/exports`, `/data-download` | `(app)` | all roles; adminId differs |
| `/users` | `(app)/users` | tabs differ by role |
| `/audit` | `(app)/audit` | all (mock) |
| `/subscription` | `(app)/subscription` | superadmin free view vs paid |
| `/profile` | `(app)/profile` | all |

Sidebar sections per role: superadmin gets everything incl. Administration (Users, Audit, Subscription); admin gets Administration w/o Audit; contractor minimal; authority read-only. **Defaults role to `superadmin` if `userType` falsy.**

## 7. IoT Data Flow (verified)

1. **ESP32** (`firmware/esp32_sensor_node/esp32_sensor_node.ino`) reads DHT22/battery/strain (fake-sensor default), publishes `SensorData` (15s), `NodeData` (30s), `HeartbeatData` (60s) to `esp32/<gatewayDeviceId>/data` on local broker (Pi).
2. **Pi gateway** (`gateway-pi/pi_gateway.py`) subscribes `esp32/+/data`, forwards verbatim to cloud broker `shm/device/data` (QoS1) and optionally REST `POST /api/beamDeviceData` with `x-api-key`.
3. **Node sample gateway** (`gateway/index.js`) — dev simulator producing synthetic payloads on same `shm/device/data` topic + REST (default `dev-iot-key`).
4. **Backend ingest** — two paths converge on `iot.service.createNetworkDataFromDevice`:
   - REST: `POST /api/beamDeviceData` (`requireApiKey`).
   - MQTT: `mqtt-ingest.ts` subscribes `shm/device/#` → same pipeline.
5. **Pipeline**: validate zod schema → find Device by (gatewayDeviceId) → find registered active Project by deviceId + date-range check → dispatch:
   - `NodeData` → `node_data` inserts.
   - `HeartbeatData` → device `updateHeartBeat`.
   - `SensorData` → device channel lookup → calibrate (`calibrationValue * raw`) → `sensor_data` insert → republish to `shm/sensor/<dev>/<sensor>` → threshold check → email alert (currently broken, see finding #3).
6. **Consumers**: frontend dashboards pull via `/api/dashboard`, reports, exports; MQTT feed in `/mqtt` page (WS 9001).

## 8. Problems / Gaps Summary Table

| # | Severity | Area | Gap |
|---|---|---|---|
| 1 | Critical | Security | IDOR / missing object-level authz on project/device/sensor/channel/email routes (read-side IoT feeds fixed in P1.7) |
| 2 | Critical | Security | Frontend role gating is presentational only; no middleware/route guard |
| 3 | Critical | Alerting | Threshold alert emails broken (`to: ""`), dedup logic wrong |
| 4 | High | IoT | New MQTT connection per sensor reading |
| 5 | High | Security | API key default + anonymous broker |
| 6 | High | Audit | No audit writes despite table |
| 7 | High | Infra | Redis provisioned, zero usage → ✅ P3: shared rate-limit store + dashboard cache |
| 8 | High | Billing | Subscription UI mock, no backend → ✅ P2: billing backend + plan enforcement + real-data UI |
| 9 | High | Validation | Many endpoints lack zod validation |
| 10 | Medium | Data integrity | String FKs everywhere; no DB-level integrity |
| 11 | Medium | IoT | Channel→sensor mapping picks arbitrary channel (fixed in P1.9) |
| 12 | Medium | Frontend | Hardcoded demo data + dead deps + no error boundaries |
| 13 | Medium | Config | Hardcoded localhost API fallback; `.env.example` missing API var |
| 14 | Medium | IoT | Split-brain ingest endpoints (`beamDeviceData` vs `sensorDataFromDevice`) — both now keyed (P1.8) |

## 9. Target Architecture (recommended)

1. **Auth layer**: keep JWT minimal + per-request DB rehydration. Add refresh-token reuse-detection hardening, optional `/me` endpoint.
2. **Authorization**: centralize object-level (tenant) checks. Add a `projectScope(user)` helper returning a Prisma `where` fragment and apply consistently:
   - `admin` → `createdBy = user.id`
   - `contractor` → `contractorId = user.id`
   - `authority` → `authorityId = user.id`
   - `superadmin` → no filter
   Apply to projects, devices, sensors, channels, email settings, reports, exports, data-download, dashboard.
3. **Frontend authz**: add Next.js `middleware.ts` + a `RoleRoute` guard; stop defaulting role to superadmin.
4. **Audit**: implement `audit.log(entity, action, ...)` helper and wire it into create/update/delete on users/projects/devices/sensors/devices-channels; allow superadmin + admin(view) to read.
5. **Redis**: pick a use-case (rate limiting, session, node-data cache, MQTT buffering) and implement it, or remove the container. (Recommended: shared rate-limit store + sensor-data recent-reads cache.)
6. **Billing**: create a `Subscription`/`Plan` model + role-aware enforcement middleware; keep superadmin free.
7. **Alerting**: fix email `to`/`bcc`; per-channel throttle window; add in-app alerts list backed by `notifications` table (currently mock page).
8. **MQTT**: single long-lived publish client; broker auth (password + ACL); per-tenant topic namespaces.
9. **Validation**: port zod schemas to all create/update endpoints.
10. **Data integrity**: migrate string FK columns to real FKs where feasible, or at least add `@@index` + checks; document mapping.
11. **Frontend**: remove dead deps, add `error.tsx`/`not-found.tsx`, unify loading, centralize mock-data fallback (opt-in demo flag).

## 10. Migration Plan (incremental)

Phase 0 — **Baseline hardening (small, coherent, low-risk):**
- ✅ P0.1 Backend: apply `assertProjectAccess` + device/sensor scope to all read/write routes that are missing it. Done for `updateProject`, `updateProjectDetail`, `projectCodeCreation`, `projectOffsetById`, `projectSetup`, `channelList/:deviceId` (+ `ensureDeviceAccess`), and channel mutations (`channelListUpdate`, `channelSwap`, `removeSensorFromChannel`) via new `assertDeviceAccessByChannelId`.
- ✅ P0.2 Backend: fix `thresholdTriggeredAlert` — real `sensorDataId` (was: FK violation from writing reading value), email `to`/`bcc` split (was: empty `to`), per-sensor-per-day dedup (was: global-once-per-day).
- ✅ P0.3 Backend: single long-lived MQTT publish client (was: new connection per reading).
- ✅ P0.4 Backend: implement audit logging writes (`src/utils/audit.ts`) across user/project/device/sensor create-update-delete; pre-existing `tsc` build errors fixed (`assignSensorAdminSchema` import).
- ✅ P0.5 Frontend: add `RoleGuard` + `ROLE_ROUTE_ACCESS` (`src/lib/rbac.ts`, `src/components/auth/role-guard.tsx`); sidebar no longer over-privileges (falls back to `authority` instead of `superadmin`).
- ✅ P0.6 Frontend: fix API base URL — default `"/api"` (+ compose sets `NEXT_PUBLIC_API_URL=/api`), expand backend `ALLOWED_ORIGINS` for nginx; add `error.tsx` + `not-found.tsx`; document `NEXT_PUBLIC_API_URL` in `.env.example`.

Phase 1 — **Authz refactor & tenant isolation tests:**
- ✅ P1.1 Dashboard IDOR closed: `userId`/`userType` in dashboard/graph bodies are ignored; identity always derived from the authenticated session (`req.user`).
- ✅ P1.2 Users registry scoped: `adminList`, `assignedSensor`, `assignedDevice` now clamp `:adminId` to the caller's own id unless superadmin (contractor/authority blocked entirely).
- ✅ P1.3 Project-scoped reports/exports: all `/reportSensor*`, `exportCsv`, `importCsv` enforce `assertProjectAccessByUniqueId`.
- ✅ P1.4 CSV downloads (`download/device`, `download/sensor`, `download/projects`, `download/list`) clamp `:adminId` to caller tenant.
- ✅ P1.5 Bug fix: `ensureSensorAccess` middleware read `req.params.id` while routes use `:sensorId` (dangling 404). Now resolves `sensorId` first.
- ✅ P1.6 Added `backend/test/isolation.test.ts` — register+verify two tenant admins, seed A's device/sensor/channels/project/contractor, assert B gets 403/404 across projects, channels, devices, sensors, dashboards, user listings, reports, exports; owner A still succeeds. **15/15 backend tests green.**
- ✅ P1.7 IOT read scoping (`beamNodeData`/`beamGetSensorData` IDOR closed): node/sensor data feeds derive device scope from the session — superadmin sees all, others only their own `assignedAdmin`/`addedBy` devices (403 for foreign device sensor reads). Covered by a new isolation test.
- ✅ P1.8 Ingest auth aligned: `POST /api/sensorDataFromDevice` switched from `authenticate` to `requireApiKey` (parity with `beamDeviceData`); live check: 401 without key, 200 with key.
- ✅ P1.9 IoT channel mapping fixed: `handleSensorData` pairs each channel reading with its corresponding `device_channel` by index (was: always the first channel with an assigned sensor → wrong calibration/alert routing on multi-channel nodes).
- ✅ P1.10 Route/data-access hardening:
  - `POST /api/project_analysis` (global project start/end cron job) restricted to `superAdminOnly` (was: any authenticated user could trigger cross-tenant status transitions + emails).
  - SQL injection eliminated in `reports.service.buildSensorReport` (`$queryRawUnsafe` string interpolation of `sensorId`/`startDate`/`endDate`/`projectId`) → parameterized `Prisma.sql` + whitelisted `groupExpr` via `Prisma.raw`.
  - Cross-tenant IDOR closed in `POST /api/download/sensorData` + `POST /api/download/nodeData`: raw telemetry CSV exports previously accepted any `projectId`/`deviceId` from the body. Now tenant-scoped via `resolveTenantScope` (superadmin unlimited; admin → own projects/devices; contractor/authority → their projects' devices); explicit foreign anchors return 403.
  - Frontend `src/middleware.ts` added: server-side redirect of unauthenticated users off protected routes to `/login?from=…` and redirect of logged-in users off `/login`. Role gating stays client-side (`RoleGuard`); backend remains the enforcement authority.
- ▶ P1.11 Follow-up (todo): frontend `RoleGuard` + `ROLE_ROUTE_ACCESS` audits against the new nav map; spawn with Phase 2 billing (touches project/tenant scoping). — ✅ Audited: `RoleGuard` wraps every `(app)` route in `layout.tsx`, `ROLE_ROUTE_ACCESS` matches the sidebar for every role (superadmin `*`, admin incl. `/data-download`/`/subscription`; contractor/authority scoped), and the fallback never over-privileges (defaults to `authority`). Backend remains the enforcement authority.

Phase 2 — Billing/subscription backend + role-aware enforcement.
- ✅ P2.1 Prisma models: `BillingPlan` (code/limits/feature flags), `Subscription` (per-admin, status trial/active/past_due/canceled), `Invoice` (tenant-scoped CSV source); `User.subscription` relation; migration `20260908105946_add_billing`.
- ✅ P2.2 Seed: `complimentary` (unlimited, features on), `starter` (3 structures/20 sensors/5 users), `professional` (20/200/25), `enterprise` (unlimited, custom quote); existing admins backfilled to a 14-day `trial` on Starter.
- ✅ P2.3 Subscription module (`src/modules/subscription`): `GET /api/subscription/plan` (superadmin → complimentary; admin → plan + usage + catalog; contractor/authority → denied 403), `POST /api/subscription/plan` (switch; creates OPEN invoice for paid plans), `GET /api/subscription/invoices`, `POST /api/subscription/invoices/:invoiceNo/download` (tenant-scoped CSV — 404 for a foreign admin). Lazily provisions a trial on first read.
- ✅ P2.4 Plan enforcement (`assertWithinLimits`): central `402 Payment Required` guard wired into `createNewProject` (structure) and member registration (user); honors nullable/unlimited limits and the superadmin exemption.
- ✅ P2.5 UI: `use-subscription.ts` hooks + `/subscription` page rewritten to real data (current plan, usage bars, switch plan, entitlement matrix, tenant-scoped invoice history + CSV download). `tsc` and `eslint` clean.
- ✅ P2.6 Tests `backend/test/billing.test.ts` (7): default trial + zero usage, contractor blocked (403), member-add over limit (402), structure limit at service layer, switch → professional + OPEN invoice, invoice download owner-scoped (404 cross-tenant), superadmin complimentary + cannot switch.**Full suite green (23 tests).**

Phase 3 — Redis usage (rate limiting + hot-data cache) or removal.
- ✅ P3.1 `ioredis` added (`^5.11.1`); lazy singleton client in `src/config/redis.ts` (`getRedis()`/`redisAvailable()`/`redisIncr`/`redisGet`/`redisSet`/`redisDel`) with graceful degradation — the API keeps serving (in-memory paths) when Redis is unreachable or `REDIS_URL`/`REDIS_ENABLED` are unset. Vitest sets `REDIS_ENABLED=false` so suites stay isolated (no shared counters across runs).
- ✅ P3.2 Shared rate-limit store (`src/config/redisStore.ts` `RedisRateLimitStore`): wired into the global 500/15m limiter (`app.ts`) and the `login`/`otp` limiters (`auth.routes.ts`) via `store: rateLimitStore()`. Hits are shared across instances (INCR + EXPIRE fixed windows), falling back to the built-in `MemoryStore` per-request on any Redis failure. Verified live: `rl:*` keys present, counters increment.
- ✅ P3.3 Dashboard recent-reads cache: `GET/POST /api/dashboard` response cached per user (`dash:<type>:<userId>`, 30s TTL) with DB fallback on miss/parse failure. Verified live: `dash:admin:251` key with TTL, second request served from cache.
- ✅ P3.4 Docs updated (finding #7). Full backend suite still green (23 tests).

Phase 4 — MQTT security (auth/ACLs/topic namespaces), single client.

Phase 5 — Frontend production hardening (error boundaries, loading, dead-code removal, core-web-vitals).

Phase 6 — Python SHM service expansion (modal/spectral analysis wiring to DB).