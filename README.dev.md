# Local development bootstrap (quick-start)

This repository contains a full-stack SHM platform. The easiest way to run a local development environment (Postgres with Timescale, Redis, backend, frontend) is via Docker Compose.

> **Field hardware (ESP32 → Raspberry Pi → cloud → office):** see
> [`docs/HARDWARE_DEPLOYMENT.md`](docs/HARDWARE_DEPLOYMENT.md), the ESP32
> firmware in [`firmware/esp32_sensor_node/`](firmware/esp32_sensor_node/), and
> the Raspberry Pi gateway in [`gateway-pi/`](gateway-pi/).

Prerequisites:

- Docker and Docker Compose installed

Start the dev environment:

```bash
cd SHM
docker compose up --build
```

What this brings up:

- Postgres (TimescaleDB extension enabled) on port `5432`
- Redis on port `6379`
- Backend dev server (ts-node-dev) on port `3001`
- Frontend Next.js dev server on port `3000`

Additional services launched by the compose file:

- Timescale/Postgres: `5432`
- Mosquitto MQTT broker: `1883` (broker) and `9001` (websocket)
- Python SHM processing service (FFT example): `8000`
- A sample Node gateway that publishes to Mosquitto and forwards to the backend (see `gateway/`)

Notes:

- The backend `DATABASE_URL` is preconfigured in `docker-compose.yml` for the local DB (user: `shm`, password: `shm_pass`, db: `shm_dev`).
- The backend also subscribes to the local Mosquitto broker (`MQTT_BROKER_URL=mqtt://mosquitto:1883`) on topics `shm/device/#` — see `MQTT_INGEST_*` env vars. The bundled `gateway/` sample simulates field hardware by publishing real `BeamDeviceData` payloads there (plus a REST fallback with `x-api-key`).
- The first time Postgres initializes, `docker-init/init_timescale.sql` will enable the TimescaleDB extension.
- The compose services bind-mount your local `backend` and `frontend` folders. Containers will run `npm ci` (or `npm install`) then `npm run dev`.
- If you prefer to run locally without Docker, copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` appropriately.

Notes:

- The `backend` entrypoint runs `prisma:migrate` and `prisma:seed` on startup so the DB is migrated and seeded automatically.
- Timescale hypertable creation: `docker-init/init_hypertables.sql` is provided to create hypertables on `sensor_data` and `node_data`. Depending on your schema and Timescale version, manual review may be required before running in production.
- If port `3000` is already in use locally, the frontend is exposed on host port `3005` by default when using the compose file.

Stopping:

```bash
docker compose down
```

Next steps I can do for you:

- Add a dedicated `seed` step to the compose workflow to run `prisma seed` after DB is ready.
- Add a `make` wrapper or scripts to speed up start/stop tasks.
