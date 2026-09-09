-- ---------------------------------------------------------------------------
-- TimescaleDB hypertable conversion — INTENTIONALLY A NO-OP.
--
-- This file previously attempted to convert `sensor_data` and `node_data` into
-- hypertables at database-init time. It never worked, for two reasons:
--
--   1. ORDERING. Scripts in /docker-entrypoint-initdb.d run once, when the data
--      directory is first initialized — which is BEFORE the backend has run
--      `prisma migrate deploy`. The tables it referenced did not exist yet.
--
--   2. PRIMARY KEY. TimescaleDB requires the partitioning column to be included
--      in every UNIQUE index on the table. Prisma generates:
--
--          sensor_data_pkey PRIMARY KEY (id)
--
--      so `create_hypertable('sensor_data', 'createdAt')` fails with
--      "cannot create a unique index without the column ... used in
--      partitioning", no matter when it runs.
--
--   The previous script worked around (1) by adding a second, snake_case
--   `created_at` column and partitioning on that. That does not fix (2), and it
--   would have partitioned on a column the application never writes — Prisma
--   writes `createdAt`. The result would have been a hypertable whose partition
--   key is NULL for every row inserted after the initial backfill.
--
--   Verified state as of the architecture audit: extension installed, zero
--   hypertables, no shadow column. The script had never taken effect.
--
-- WHAT REPLACES THIS
--
--   Hypertable conversion moves into a Prisma migration that runs after the
--   schema exists, against the `measurements` table introduced with the
--   Measurement model. That table is designed for it from the start:
--
--     - primary key is composite and includes the time column
--     - `@@unique([sensorId, sequenceNumber])` for idempotent ingest also
--       includes the partition column
--     - chunk interval and a compression/retention policy are set explicitly
--
--   Converting the legacy `sensor_data` table in place is deliberately not
--   attempted: it is replaced by `measurements`, so changing its primary key
--   now would be churn on a table that is being retired.
--
-- Do not add DDL here. Schema changes belong in prisma/migrations so that the
-- schema has exactly one source of truth.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE 'init_hypertables.sql: no-op. Hypertable setup is performed by a Prisma migration against the measurements table; see comments in this file.';
END
$$;
