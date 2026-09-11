# Structural Health Monitoring Platform

A multi-tenant platform for monitoring civil structures — bridges, flyovers, piers
— from instrumented field hardware through to an office dashboard. Built and
operated by **Cloudglance Sensinglab Pvt Ltd**.

Sensor nodes on the structure publish over MQTT to a gateway in the field; the
gateway forwards to the cloud, where the backend ingests, stores and analyses
readings; engineers and stakeholders read them from the web console.

---

## Contents

- [Running it locally](#running-it-locally)
- [How the system fits together](#how-the-system-fits-together)
- [Repository layout](#repository-layout)
- [Tenancy and roles](#tenancy-and-roles)
- [Projects, stakeholders and devices](#projects-stakeholders-and-devices)
- [Accounts, sign-in and billing](#accounts-sign-in-and-billing)
- [API](#api)
- [Database](#database)
- [Configuration](#configuration)
- [Testing](#testing)
- [Field hardware](#field-hardware)
- [Deployment](#deployment)
- [Security notes](#security-notes)

---

## Running it locally

Everything runs through Docker Compose. There is no root `package.json`, so
there is no `npm run dev` at the top level — this is the equivalent:

```bash
cd SHM
docker compose up -d          # or: up --build, the first time
```

| Service | Port | Notes |
|---|---|---|
| Frontend (Next.js dev) | `3000` | also published on `3005` |
| Backend (Express, ts-node-dev) | `3001` | `/api` |
| nginx | `80` | serves frontend and `/api` on one origin |
| PostgreSQL + TimescaleDB | `5432` | user `shm`, password `shm_pass`, db `shm_dev` |
| Redis | `6379` | rate-limit counters |
| Mosquitto MQTT | `1883`, `9001` | broker, websocket |
| Python analysis service | `8000` | FFT and signal processing |

The backend container runs `prisma migrate` and the seed on startup, and
`docker-init/init_timescale.sql` enables TimescaleDB the first time Postgres
initialises. `backend/` and `frontend/` are bind-mounted, so edits reload.

```bash
docker compose stop           # stop, keeping containers and data
docker compose down           # stop and remove containers
```

Only `nginx` and `python-shm` carry `restart: unless-stopped`, so after a host
reboot the rest need bringing up by hand.

To run without Docker, copy `backend/.env.example` to `backend/.env`, point
`DATABASE_URL` at your own Postgres, and run `npm run dev` in `backend/` and
`frontend/` separately.

---

## How the system fits together

```
 FIELD                                CLOUD                         OFFICE
 ESP32 nodes ──MQTT──► Pi gateway ──MQTT/REST──► backend ──► Postgres ──► web console
  strain, load,        local mosquitto           Express      Timescale     Next.js
  DHT22, battery       store-and-forward         + Prisma     hypertables
```

Two ingestion paths share one JSON contract, so the console is agnostic to
which was used:

- **MQTT** — gateway publishes to `shm/device/#`, the backend subscribes.
- **REST** — `POST /api/beamDeviceData` with an `x-api-key` header, used as a
  fallback when the broker is unreachable.

Readings land in `sensor_data` and `node_data`, both TimescaleDB hypertables.

---

## Repository layout

```
SHM/
├── backend/            Express + Prisma API (TypeScript)
│   ├── prisma/         schema, migrations, seeds
│   ├── src/modules/    one folder per domain: auth, projects, devices,
│   │                   invitations, billing, measurements, alerts, …
│   ├── src/middleware/ auth, permissions, tenancy, rate limits
│   └── test/           vitest suites (run against a real database)
├── frontend/           Next.js App Router console
│   ├── src/app/(app)/  authenticated screens
│   ├── src/app/(auth)/ login, register, reset-password
│   └── src/components/ UI primitives and layout
├── gateway/            sample Node gateway that simulates field hardware
├── gateway-pi/         Raspberry Pi field gateway (Python)
├── firmware/           ESP32 sensor node firmware
├── python_shm_service/ FFT / analysis service
├── mosquitto/          broker config, ACL, credentials (owned by uid 1883)
├── nginx/              reverse proxy config
└── docker-init/        TimescaleDB extension and hypertable bootstrap
```

---

## Tenancy and roles

**Tenant is the isolation root.** Every tenant-owned table carries `tenantId`,
so isolation is a column the database enforces rather than a check each route
has to remember. A tenant id is never taken from a request body — it comes from
the session.

Two overlapping models are in play during an ongoing migration:

- **`User.userType`** — the legacy role: `superadmin`, `admin`, `contractor`,
  `authority`. Still used by project access checks and parts of the frontend.
- **`Membership.role`** — the RBAC role inside one tenant:
  `ORGANIZATION_ADMIN`, `SHM_ENGINEER`, `TECHNICIAN`, `VIEWER`, with
  permissions stored as rows so the grant matrix can be inspected and changed
  without a deploy.

A **platform operator** (`User.isPlatformAdmin`) holds no membership at all:
`resolveAuthContext` resolves their `tenantId` to `null` deliberately, so that
running the platform never quietly becomes being an admin inside one customer's
organization. Their own projects live in a reserved organization identified by
the slug `platform-operator`, provisioned on first use.

`GET /api/me` reports the session's identity, tenant, role and permissions. The
frontend renders from that rather than inferring entitlements from a role name.

---

## Projects, stakeholders and devices

A project belongs to whoever creates it — an admin's own organization, or the
operator organization for a platform operator. There is no organization
chooser.

**Adding a contractor or authority.** The administrator names an email; a
six-digit code is mailed to it. The recipient reads the code back, the
administrator enters it and then records the account — name, company name and
logo, phone, and a first password. There is no link in the email and no page
the invitee visits.

- Codes are stored hashed, expire in 7 days, and lock after five wrong guesses.
- An invitation confers nothing until completed: `Project.contractorId` and
  `authorityId` stay null, so an invited person has no access.
- Completing sets the person's `userType` to the role they were assigned, so
  project access checks match. Platform operators and the organization's own
  admin are exempt — re-roling them would remove their authority over the work
  rather than granting any.
- Removing a stakeholder clears the slot, and drops their membership only when
  they hold no other project in that organization, created none, and are not
  its `ORGANIZATION_ADMIN`.

**Devices.** A device is one physical cabinet, so it serves one live project at
a time. `Device.deviceId` is the serial number and is unique. Choosing a device
claims it (`isOngoing`) in the same transaction that creates the project;
ending or deleting the project releases it. Only devices that are free and have
sensors assigned are offered. A project's device can be changed only while the
project is **Not Started**.

---

## Accounts, sign-in and billing

- **Organization admins** register with a company name and logo, which
  provisions their tenant. The account activates on a **verified payment
  webhook** and nothing else — no free trial, and a browser returning from
  checkout activates nothing.
- **Razorpay** is the payment provider; pricing is in rupees. Plans live in
  `billing_plans` and cap structures, sensors and users.
- **Google sign-in** creates ordinary users only, and is refused for an address
  already belonging to an admin or operator.
- **Platform operators** must clear an emailed one-time code at sign-in when
  mail is configured, unless they have enrolled TOTP.
- A password an administrator sets for someone else is **never forced** to be
  changed; the owner may change it from their profile.

Every role edits their own profile — name, phone, company name and logo — at
`PATCH /api/me`, which takes no id and can only write the session's own row.

---

## API

Base URL `http://localhost:3001/api` (or `/api` through nginx). Authentication
is a JWT access token in an HTTP-only cookie, with refresh-token rotation.
Responses carry `status_code` and `message`; list endpoints wrap rows in a
pagination envelope (`currentData`, `totalItems`, …).

Route groups: authentication, users, projects, devices, sensors, channels,
gateways, structures, measurements, analysis, alerts, inspections, reports,
exports, dashboard, billing, subscription, invitations, audit, IoT ingest, and
platform-operator surfaces.

---

## Database

PostgreSQL 15 with TimescaleDB, accessed through Prisma.

- Schema: `backend/prisma/schema.prisma`
- Migrations: `backend/prisma/migrations/` — apply with
  `npx prisma migrate deploy` (`migrate dev` needs a TTY and fails in the
  container).
- `sensor_data` and `node_data` are hypertables.
- Seeds: `npm run prisma:seed`, plus `seed:demo-users` and `seed:demo-project`.

The platform was migrated from a legacy MySQL system; that database remains the
source of truth for the historical import, and `legacy-backup-*.tar.gz` in the
parent folder holds the original PHP/MySQL application.

---

## Configuration

Backend `.env` (see `backend/.env.example` for the full list):

```env
PORT=3001
NODE_ENV=development
DATABASE_URL="postgresql://shm:shm_pass@postgres:5432/shm_dev?schema=public"

JWT_SECRET=<random hex>            JWT_REFRESH_SECRET=<random hex>
JWT_ACCESS_EXPIRY=24h              JWT_REFRESH_EXPIRY=7d

# Origin used to build links that are EMAILED to people. Must be an address the
# recipient's browser can open. docker-compose reads APP_URL from the
# environment and sets both names from it.
APP_URL=http://localhost:3000
BASE_URL=http://localhost:3000

MQTT_BROKER_URL=mqtt://mosquitto:1883
MQTT_INGEST_ENABLED=false

GMAIL_ACCOUNT=…                    GMAIL_PASSWORD=<app password>
BILLING_ENABLED=true               BILLING_WEBHOOK_SECRET=…
RAZORPAY_KEY_ID=…                  RAZORPAY_WEBHOOK_SECRET=…
GOOGLE_CLIENT_ID=…                 GOOGLE_CLIENT_SECRET=…

REGISTER_RATE_LIMIT_MAX=5          OTP_RATE_LIMIT_MAX=10
ALLOWED_ORIGINS=http://localhost:3000
IOT_API_KEY=<random key>
```

Frontend `.env.local`:

```env
NEXT_PUBLIC_API_URL=/api
```

With no SMTP credentials **no outbound mail is sent at all** — verification
links, reset links and invitation codes go nowhere. Each feature refuses
cleanly while unconfigured rather than appearing to work.

---

## Testing

Backend tests are vitest suites that run against a **real database**, so they
run inside the container:

```bash
docker compose exec backend npx vitest run              # everything
docker compose exec backend npx vitest run test/x.test.ts
docker compose exec backend npx tsc --noEmit            # type check
```

They share one database and clean up by fixture email, so `vitest.config.ts`
sets `fileParallelism: false`. `test/setup.ts` pins environment that behaviour
depends on — mail deliberately unconfigured, billing secrets fixed, rate limits
raised — because a developer's `.env` must not change what the suite tests.
Suites that register organizations must delete the tenants they create; see
`test/fixtures/tenants.ts`.

Frontend has no test runner configured:

```bash
docker compose exec frontend npx tsc --noEmit
docker compose exec frontend npx next lint
```

---

## Field hardware

See `firmware/esp32_sensor_node/` and `gateway-pi/` for the code, and the
wiring and flashing notes kept with each.

**Equipment.** ESP32 sensor nodes (strain gauges, load cells, DHT22,
battery monitoring) → Raspberry Pi gateway running mosquitto locally →
cloud broker.

**Bring-up.**

1. Cloud: broker reachable, `MQTT_INGEST_ENABLED=true`, credentials in
   `mosquitto/passwd` and topic rules in `mosquitto/acl` (owned by uid 1883, so
   editing needs `sudo`).
2. Register the device in the console (Devices → add, with its serial), assign
   sensors, then attach it to a project.
3. Field: flash the ESP32 nodes with the gateway id; configure
   `gateway-pi/pi_gateway.py` with the cloud broker and API key.
4. Verify: watch `shm/device/#` on the cloud broker, then confirm rows arriving
   in `sensor_data`, then the project dashboard.

The Pi gateway stores and forwards, so a dropped link backfills when it
returns.

---

## Deployment

1. Provision a host with Docker, and a domain with TLS terminating at nginx.
2. Set `APP_URL` to the public origin **before** inviting anyone — emailed
   links and codes point there, and `http://localhost:3000` only works on the
   machine itself.
3. Supply real secrets for JWT, Razorpay, SMTP and Google; generate fresh JWT
   secrets rather than reusing development values.
4. `npx prisma migrate deploy`, then seed roles and plans.
5. Put the MQTT broker behind TLS and real credentials.

---

## Security notes

- Tenant isolation is enforced on `tenantId` columns; ids come from the session
  and never from a request body.
- Passwords are bcrypt hashed (cost 10). Reset tokens, invitation codes and
  refresh tokens are stored only as SHA-256 hashes, so a stolen backup yields
  nothing replayable.
- Rate limits guard sign-in, registration and every route that accepts a mailed
  code.
- Uploads are validated by magic bytes, not the browser's reported MIME type,
  and stored as relative paths.
- Audit rows record who did what, with IP and user agent.
- Platform operators can open a **read-only** view-as session; the banner
  reporting it comes from the server, not client state.
