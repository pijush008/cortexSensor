# Structural Health Monitoring Platform

A multi-tenant platform for monitoring civil structures — bridges, flyovers, piers
— from instrumented field hardware through to an office dashboard. Built and
operated by **Cloudglance Sensinglab Pvt Ltd**.

Sensor nodes on the structure POST their readings to the cloud over HTTPS,
where the backend validates, stores and analyses them; engineers and
stakeholders read them from the web console.

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
 FIELD                              CLOUD                          OFFICE
 ESP32 nodes ──HTTPS──► backend ──► Postgres ──► SSE ──► web console
  strain, load,         Express      Timescale          Next.js
  DHT22, battery        + Prisma     hypertables
```

Devices ingest over HTTPS:

- `POST /api/beamDeviceData` with an `x-api-key` header — the documented
  contract, taking a batch of telemetry per request.
- `POST /api/sensorDataFromDevice` — the older single-reading form, kept for
  devices already deployed against it.

Both go through the same validation, tenant scoping, calibration, channel
gating and `eventId` de-duplication, which is why devices ingest through the
API rather than writing to the database directly.

Ackcio Beam gateways have their own endpoint, `POST /api/v1/ingest/ackcio/<token>`,
which speaks the gateway's HTTP(S) API Push format directly. See
[Ackcio gateways](#ackcio-gateways).

An MQTT path existed previously, with a Mosquitto broker, gateway subscribers
and ESP32 firmware that published to it. All of it was removed; new device
code targets the two endpoints above directly.

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
├── python_shm_service/ FFT / analysis service
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

**Gateways.** A project owns one Ackcio gateway, exclusively. `gateways.projectId`
is unique in the database, so a second project cannot claim the same unit even
if two people try at once: the claim is written in the same transaction as the
project that makes it, and only free gateways are offered in the form. Ending or
deleting the project releases the gateway. It can be swapped from the project
page while the project is not collecting (Not Started or Paused), never while
running. Every node behind the gateway, and every sensor on those nodes, is the
project's data.

**Devices.** The older arrangement, kept for projects that predate gateways: a
device is one physical cabinet and serves one live project at a time. Choosing a
device claims it (`isOngoing`) in the same transaction that creates the project;
ending or deleting the project releases it.

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
- `measurements` and `gateway_readings` are hypertables where TimescaleDB is
  present (the local container), plain tables on Supabase.
- Ackcio: `gateways` (one project each), `devices` are the nodes, `sensors`,
  `gateway_readings` (every channel as sent), `measurements` (what charts and
  alerts read), `node_data`, `node_network_data`, `gateway_heartbeats`, and
  `ingestion_files` (the FTP ledger).
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

ESP32 sensor nodes (strain gauges, load cells, DHT22, battery monitoring)
send readings over HTTPS to `POST /api/beamDeviceData` with the device's
`x-api-key`. No firmware lives in this repository: the earlier MQTT-based
node and Raspberry Pi gateway were removed with the broker, and the device
code that replaces them is kept with the hardware project.

**Bring-up.**

1. Register the device in the console (Devices → add, with its serial), assign
   sensors, then attach it to a project.
2. Issue the device an API key and point it at `POST /api/beamDeviceData`.
3. Verify: confirm rows arriving in `sensor_data`, then the project dashboard.

Whatever sends the readings should buffer them locally, so that a dropped link
backfills when it returns rather than losing the window.

### Ackcio gateways

An Ackcio Beam gateway pushes readings as JSON over HTTPS in the format of the
*ACKCIO Beam Gateway API Specification*: one POST per sensor per sample, plus
hourly node health, mesh link and gateway heartbeat payloads. The gateway
authenticates by URL alone, so the secret is part of the address.

**Bring-up.**

1. Register the gateway in the console (Gateways → register) with the
   `GatewayDeviceId` printed on the unit, e.g. `F01E`.
2. Open the gateway and issue its **push URL**. It is shown once. Copy it into
   the gateway's own dashboard under HTTP(S) API Push.
3. That is all. Nodes and their sensors are created the first time they report,
   named from the node name, sensor code and channel type configured on the
   gateway, and appear on the gateway page and under Devices and Sensors.
   Rename them there if you want; the mapping is kept on the device's channels
   as `<SensorId>.<ChannelId>`.

Re-issuing the URL revokes the old one. Every push is acknowledged with 200
once it parses, whatever is done with it, because the gateway retries anything
else indefinitely; readings the server could not use are written to the log.

**Over FTPS instead.** The gateway can also upload CSV files (the *ACKCIO Beam
Gateway FTP Specification*). The VPS runs vsftpd with FTPS; the API container
watches the drop directory and processes each file once:

```
Ackcio Gateway ──FTPS──► vsftpd ──► /srv/ftp/ackcio/incoming
                                         │
                       API container: FTP_INGEST_DIR=/ingest, scanned every 15 s
                                         │
                   parse SensorData_/NodeData_/NetworkData_/HeartbeatData_/ErrorSensorData_
                                         │
                       same ingest service as HTTP push ──► Supabase
                                         │
                   file moved to processed/<date>/, failed/ or unknown/
```

- Every file gets a row in `ingestion_files` with its outcome, row counts and
  any error; the row's content hash makes a repeated upload a no-op, and rows
  already stored by an earlier file (or an HTTP push) are skipped by the same
  idempotency key.
- A file from a gateway that is not registered is kept in `unknown/`, recorded
  as *Unknown gateway*, and attached to nothing. The Ingestion page under
  Gateways lists it with the gateway ID to register.
- A file that cannot be parsed is kept in `failed/` with the reason.
- The gateway writes local time. A header zone (`Date Time (UTC+08:00)`) is
  honoured; otherwise `ACKCIO_CSV_UTC_OFFSET` is assumed.

Set up the FTP server with `deploy/vsftpd/setup.sh`; see [Deployment](#deployment).

What is stored: every channel of every push, as sent, in `gateway_readings`;
the measurand channels also in `measurements`, with the gateway's `Reading` as
the value and `RawReading` as the raw value, so alerts, the live stream and the
charts treat them like any other reading; node health in `node_data` (battery
in millivolts), mesh links in `node_network_data`, heartbeats in
`gateway_heartbeats`. A channel the gateway flagged as `error` is kept and
carries `OUT_OF_RANGE`. Retried pushes are de-duplicated on gateway, node,
sensor, channel and timestamp.

---

## Deployment

1. Provision a host with Docker, and a domain with TLS terminating at nginx.
2. Set `APP_URL` to the public origin **before** inviting anyone — emailed
   links and codes point there, and `http://localhost:3000` only works on the
   machine itself.
3. Supply real secrets for JWT, Razorpay, SMTP and Google; generate fresh JWT
   secrets rather than reusing development values.
4. `npx prisma migrate deploy`, then seed roles and plans.
5. Issue each device its own API key rather than sharing one fleet-wide.
6. For Ackcio gateways uploading over FTPS, on the VPS as root:

   ```bash
   cd SHM
   sudo ./deploy/vsftpd/setup.sh shm.example.com 203.0.113.10 'a-long-ftp-password'
   ```

   It installs vsftpd, creates the `ackcio` login jailed to
   `/srv/ftp/ackcio`, reuses nginx's Let's Encrypt certificate for FTPS, opens
   ports 21 and 40000–40100, and prints the settings to enter on the gateway.
   `.env.prod` then needs `FTP_INGEST_DIR=/ingest` (the example file has it),
   and the production compose file mounts the drop into the API container.

### Checking each part works

Run these from the `SHM` directory. The backend tests need the local Postgres
and Redis containers: `docker compose up -d postgres redis`.

| Part | Command | What passing means |
|---|---|---|
| Schema | `cd backend && npx prisma migrate deploy && npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` | migrations applied, no drift |
| Gateway ownership | `cd backend && npx vitest run test/project-gateway.test.ts` | one project per gateway, races refused, release on end |
| HTTP push | `cd backend && npx vitest run test/ackcio-contract.test.ts test/ackcio-ingest.test.ts` | every spec payload stored, duplicates suppressed |
| CSV parsing | `cd backend && npx vitest run test/ackcio-csv.test.ts` | every spec CSV example converts |
| FTP drop | `cd backend && npx vitest run test/ftp-ingest.test.ts` | files stored, ledgered, moved; unknown gateways kept |
| Everything | `cd backend && npx vitest run` | the whole suite |
| Console | `cd frontend && npx tsc --noEmit && npx eslint src && npx next build` | typecheck, lint, production build |

To try the drop by hand without vsftpd, point `FTP_INGEST_DIR` in `backend/.env`
at any folder, start the API, copy a CSV into `<folder>/incoming/`, and watch
the log line `FTP ingest: <file>: N stored`. Then open Gateways → Ingestion.

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
